/**
 * Unit cover for the two Desktop features that decorate surfaces upstream
 * owns: sidebar folder colours with named dividers, and inlining dropped text
 * files into the composer.
 *
 * Both features split their decisions out of their DOM work precisely so this
 * file can exist: the suite runs in a node environment, so everything asserted
 * here is a value transform. The DOM halves (painting, event interception) are
 * checked by hand in a running app, and INSTALL.md says which anchors they
 * depend on.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceDecor } from '../src/client/desktop-extras/WorkspaceDecor.tsx'
import {
  clearStaged,
  composeMessage,
  hasStagingHost,
  registerStagingHost,
  resetStaging,
  stagedFiles,
  stageFiles,
  subscribeStaged,
  unstageFile,
} from '../src/client/desktop-extras/text-drop-store.ts'
import {
  addDivider,
  DECOR_PALETTE,
  DECOR_STORAGE_KEY,
  dividersAbove,
  dividersAtTail,
  EMPTY_DECOR,
  mintDividerId,
  reconcileDecor,
  readDecor,
  removeDivider,
  renameDivider,
  setWorkspaceColor,
  swatchValue,
  TAIL_ANCHOR,
  writeDecor,
  type DecorStorage,
  type WorkspaceDecorState,
} from '../src/client/desktop-extras/workspace-decor-store.ts'
import {
  identifyWorkspaceRows,
  type SidebarWorkspaceRow,
} from '../src/client/desktop-extras/sidebar-workspace-rows.ts'
import {
  capContent,
  dragCarriesFiles,
  extensionOf,
  fenceFile,
  isTextFile,
  joinBlocks,
  longestBacktickRun,
  ownsDrop,
  MAX_INLINE_BYTES,
  TRUNCATION_NOTICE,
} from '../src/client/desktop-extras/text-drop-model.ts'

/** An in-memory DecorStorage, plus a hook to plant raw values. */
function storage(seed?: string): DecorStorage & { raw: () => string | null } {
  let value: string | null = seed ?? null
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next },
    raw: () => value,
  }
}

/** A row stand-in; identification reads nothing off the elements themselves. */
function row(label: string): SidebarWorkspaceRow {
  const element = { label } as unknown as HTMLElement
  return { section: element, row: element, label }
}

describe('workspace decoration state', () => {
  it('round-trips colours and dividers through storage', () => {
    const store = storage()
    const state = addDivider(
      setWorkspaceColor(EMPTY_DECOR, 'ws-1', 'teal'),
      'ws-2',
      'Clients',
      'd-1',
    )
    writeDecor(store, state)
    expect(readDecor(store)).toEqual(state)
  })

  it('clears a colour rather than storing an empty one', () => {
    const state = setWorkspaceColor(setWorkspaceColor(EMPTY_DECOR, 'ws-1', 'blue'), 'ws-1', null)
    expect(state.colors).toEqual({})
  })

  it('reads an absent, malformed, or wrongly-shaped payload as undecorated', () => {
    // A corrupt value has to degrade to a plain sidebar, never to a crash
    // during a paint pass.
    expect(readDecor(storage())).toEqual(EMPTY_DECOR)
    expect(readDecor(storage('{ not json'))).toEqual(EMPTY_DECOR)
    expect(readDecor(storage('"a string"'))).toEqual(EMPTY_DECOR)
    expect(readDecor(storage('null'))).toEqual(EMPTY_DECOR)
  })

  it('drops junk entries but keeps the sound ones beside them', () => {
    const raw = JSON.stringify({
      colors: { 'ws-1': 'teal', 'ws-2': 7, 'ws-3': '' },
      dividers: [
        { id: 'd-1', label: 'Work', above: 'ws-1' },
        { id: '', label: 'nameless id', above: 'ws-1' },
        { id: 'd-3', above: 'ws-2' },
        { id: 'd-4', label: 'no anchor' },
        'not an object',
      ],
    })
    const state = readDecor(storage(raw))
    expect(state.colors).toEqual({ 'ws-1': 'teal' })
    expect(state.dividers).toEqual([
      { id: 'd-1', label: 'Work', above: 'ws-1' },
      // A divider with no label is legitimate: it renders as a bare rule.
      { id: 'd-3', label: '', above: 'ws-2' },
    ])
  })

  it('survives a storage that throws on read and on write', () => {
    const hostile: DecorStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
    }
    expect(readDecor(hostile)).toEqual(EMPTY_DECOR)
    expect(() => { writeDecor(hostile, EMPTY_DECOR) }).not.toThrow()
  })

  it('writes under the versioned key', () => {
    const store = storage()
    writeDecor(store, EMPTY_DECOR)
    expect(DECOR_STORAGE_KEY).toBe('dsh.desktop.workspace-decor.v1')
    expect(store.raw()).toBe(JSON.stringify(EMPTY_DECOR))
  })

  it('resolves palette ids and refuses unknown ones', () => {
    expect(swatchValue('teal')).toBe('#12a594')
    expect(swatchValue('chartreuse')).toBeUndefined()
    expect(swatchValue(undefined)).toBeUndefined()
  })

  it('mints distinct divider ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintDividerId()))
    expect(ids.size).toBe(50)
  })

  it('keeps several dividers above one workspace in stored order', () => {
    let state: WorkspaceDecorState = addDivider(EMPTY_DECOR, 'ws-1', 'First', 'd-1')
    state = addDivider(state, 'ws-2', 'Other', 'd-2')
    state = addDivider(state, 'ws-1', 'Second', 'd-3')
    expect(dividersAbove(state, 'ws-1').map(entry => entry.label)).toEqual(['First', 'Second'])
    expect(dividersAbove(state, 'ws-9')).toEqual([])
  })

  it('renames and removes dividers without touching the others', () => {
    let state = addDivider(addDivider(EMPTY_DECOR, 'ws-1', 'One', 'd-1'), 'ws-2', 'Two', 'd-2')
    state = renameDivider(state, 'd-1', 'Renamed')
    expect(state.dividers).toEqual([
      { id: 'd-1', label: 'Renamed', above: 'ws-1' },
      { id: 'd-2', label: 'Two', above: 'ws-2' },
    ])
    state = removeDivider(state, 'd-1')
    expect(state.dividers).toEqual([{ id: 'd-2', label: 'Two', above: 'ws-2' }])
  })

  it('drops colours for workspaces that are gone', () => {
    const state = setWorkspaceColor(setWorkspaceColor(EMPTY_DECOR, 'ws-1', 'red'), 'ws-gone', 'blue')
    expect(reconcileDecor(state, ['ws-1']).colors).toEqual({ 'ws-1': 'red' })
  })

  it('moves a divider down when the workspace under it is deleted', () => {
    // The bug this exists for. A divider is a section heading, so deleting the
    // first Workspace under it must not take the heading with it: the section
    // below is still there and still wants naming.
    const seeded = { ...addDivider(EMPTY_DECOR, 'ws-2', 'Clients', 'd-1'), order: ['ws-1', 'ws-2', 'ws-3'] }
    const next = reconcileDecor(seeded, ['ws-1', 'ws-3'])
    expect(next.dividers).toEqual([{ id: 'd-1', label: 'Clients', above: 'ws-3' }])
  })

  it('walks past several deletions at once', () => {
    const seeded = { ...addDivider(EMPTY_DECOR, 'ws-2', 'Clients', 'd-1'), order: ['ws-1', 'ws-2', 'ws-3', 'ws-4'] }
    expect(reconcileDecor(seeded, ['ws-1', 'ws-4']).dividers[0]?.above).toBe('ws-4')
  })

  it('parks a divider at the tail rather than deleting it', () => {
    // The reported bug. A divider above the bottom Workspace has nothing to
    // move down to, and the first version deleted it. Deleting a divider is
    // the one outcome the user cannot undo, so it parks instead.
    const seeded = { ...addDivider(EMPTY_DECOR, 'ws-3', 'Last', 'd-1'), order: ['ws-1', 'ws-2', 'ws-3'] }
    const next = reconcileDecor(seeded, ['ws-1', 'ws-2'])
    expect(next.dividers).toEqual([{ id: 'd-1', label: 'Last', above: TAIL_ANCHOR }])
    expect(dividersAtTail(next).map(d => d.id)).toEqual(['d-1'])
  })

  it('leaves a parked divider parked across later changes', () => {
    const parked = { colors: {}, dividers: [{ id: 'd-1', label: 'Last', above: TAIL_ANCHOR }], order: ['ws-1'] }
    expect(reconcileDecor(parked, ['ws-1', 'ws-2']).dividers)
      .toEqual([{ id: 'd-1', label: 'Last', above: TAIL_ANCHOR }])
  })

  it('never loses a divider, whatever is deleted', () => {
    // The invariant behind both branches above.
    const seeded = {
      colors: {},
      dividers: [
        { id: 'a', label: 'A', above: 'ws-1' },
        { id: 'b', label: 'B', above: 'ws-2' },
        { id: 'c', label: 'C', above: 'ws-3' },
      ],
      order: ['ws-1', 'ws-2', 'ws-3'],
    }
    for (const survivors of [['ws-1'], ['ws-2'], ['ws-3'], ['ws-1', 'ws-3'], []]) {
      expect(reconcileDecor(seeded, survivors).dividers).toHaveLength(3)
    }
  })

  it('keeps a divider whose anchor never existed, by parking it', () => {
    const seeded = addDivider(EMPTY_DECOR, 'ws-2', 'Clients', 'd-1')
    expect(reconcileDecor(seeded, ['ws-1']).dividers)
      .toEqual([{ id: 'd-1', label: 'Clients', above: TAIL_ANCHOR }])
  })

  it('keeps a divider put when its own workspace survives a reorder', () => {
    const seeded = { ...addDivider(EMPTY_DECOR, 'ws-2', 'Clients', 'd-1'), order: ['ws-1', 'ws-2', 'ws-3'] }
    expect(reconcileDecor(seeded, ['ws-3', 'ws-2', 'ws-1']).dividers[0]?.above).toBe('ws-2')
  })

  it('records the order it last saw, so a later deletion can be followed', () => {
    expect(reconcileDecor(EMPTY_DECOR, ['ws-1', 'ws-2']).order).toEqual(['ws-1', 'ws-2'])
  })

  it('returns the same state when nothing changed, so no write is provoked', () => {
    const state = { ...setWorkspaceColor(EMPTY_DECOR, 'ws-1', 'red'), order: ['ws-1'] }
    expect(reconcileDecor(state, ['ws-1'])).toBe(state)
  })



  it('offers a palette of distinct ids and colours', () => {
    expect(new Set(DECOR_PALETTE.map(swatch => swatch.id)).size).toBe(DECOR_PALETTE.length)
    expect(new Set(DECOR_PALETTE.map(swatch => swatch.value)).size).toBe(DECOR_PALETTE.length)
  })
})

describe('workspace decoration mounting', () => {
  /** Props with only what the outer gate reads; the body never mounts here. */
  const props = (useWorkspaces: unknown) =>
    ({ t: (key: string) => key, useWorkspaces } as never)

  it('renders nothing until the Workspace hook exists', () => {
    // The regression this exists for. `useWorkspaces` is a root standard hook
    // contributed by ui-workspace's apply, and its activation order relative
    // to this entry is explicitly unconstrained. Calling it before it arrives
    // throws, and the slot error boundary latches, so the feature stays dead
    // for the whole session while the Host log shows nothing at all.
    expect(renderToStaticMarkup(createElement(WorkspaceDecor, props(undefined)))).toBe('')
    expect(renderToStaticMarkup(createElement(WorkspaceDecor, props(null)))).toBe('')
  })

  it('does not throw when the hook is absent', () => {
    expect(() => renderToStaticMarkup(createElement(WorkspaceDecor, props(undefined)))).not.toThrow()
  })
})

describe('sidebar row identification', () => {
  it('pairs rows with workspace ids by render position', () => {
    const rows = [row('Alpha'), row('Beta')]
    expect(identifyWorkspaceRows(rows, ['ws-1', 'ws-2']).map(entry => ({
      id: entry.workspaceId,
      label: entry.label,
    }))).toEqual([
      { id: 'ws-1', label: 'Alpha' },
      { id: 'ws-2', label: 'Beta' },
    ])
  })

  it('leaves the trailing Ungrouped bucket unidentified', () => {
    // Upstream appends the bucket after the real workspaces, and it owns no
    // Workspace, so it must never receive a colour or a divider.
    const identified = identifyWorkspaceRows([row('Alpha'), row('Ungrouped')], ['ws-1'])
    expect(identified).toHaveLength(1)
    expect(identified[0]?.workspaceId).toBe('ws-1')
  })

  it('pairs nothing when the DOM and the snapshot disagree', () => {
    // Mid-render the two views describe different moments; a partial mapping
    // would paint colours onto the wrong workspaces.
    expect(identifyWorkspaceRows([row('Alpha')], ['ws-1', 'ws-2', 'ws-3'])).toEqual([])
    expect(identifyWorkspaceRows([row('A'), row('B'), row('C')], ['ws-1'])).toEqual([])
  })

  it('pairs by position and not by title, so duplicates stay distinct', () => {
    const identified = identifyWorkspaceRows([row('harness'), row('harness')], ['ws-1', 'ws-2'])
    expect(identified.map(entry => entry.workspaceId)).toEqual(['ws-1', 'ws-2'])
  })

  it('handles an empty sidebar', () => {
    expect(identifyWorkspaceRows([], [])).toEqual([])
  })
})

describe('dropped text files', () => {
  const file = (name: string, type = '', size = 10) => ({ name, type, size })

  it('reads extensions case-insensitively', () => {
    expect(extensionOf('NOTES.MD')).toBe('.md')
    expect(extensionOf('archive.tar.gz')).toBe('.gz')
    expect(extensionOf('Makefile')).toBe('')
    expect(extensionOf('.gitignore')).toBe('')
  })

  it('accepts markdown by extension whatever the platform calls it', () => {
    // Platforms disagree here: text/markdown, text/plain, and '' are all seen
    // for the same .md file, which is why the extension rule leads.
    expect(isTextFile(file('notes.md', ''))).toBe(true)
    expect(isTextFile(file('notes.md', 'text/markdown'))).toBe(true)
    expect(isTextFile(file('README.markdown', 'application/octet-stream'))).toBe(true)
  })

  it('accepts anything declaring a text MIME type', () => {
    expect(isTextFile(file('data.csv', 'text/csv'))).toBe(true)
  })

  it('refuses images and unknown binaries', () => {
    expect(isTextFile(file('shot.png', 'image/png'))).toBe(false)
    expect(isTextFile(file('app.bin', 'application/octet-stream'))).toBe(false)
  })

  it('claims a drop only when every file is text', () => {
    expect(ownsDrop([file('a.md'), file('b.txt')])).toBe(true)
    expect(ownsDrop([])).toBe(false)
    // Mixed drops stay with upstream: claiming one would stop the event and
    // take the images down with it.
    expect(ownsDrop([file('a.md'), file('shot.png', 'image/png')])).toBe(false)
  })

  it('claims any file drag, because a drag cannot be inspected', () => {
    // The regression this exists for, twice over. Chromium withholds item
    // contents during a drag and never exposes filenames, so every attempt to
    // identify the file mid-drag read as empty and the claim never fired.
    // 'Files' in types is the one signal that is actually present, and it is
    // what upstream's own handler tests.
    expect(dragCarriesFiles({ types: ['Files'] })).toBe(true)
    expect(dragCarriesFiles({ types: ['Files', 'text/plain'] })).toBe(true)
  })

  it('ignores drags carrying no files', () => {
    // A dragged text selection is not a file drop and stays upstream's.
    expect(dragCarriesFiles({ types: ['text/plain'] })).toBe(false)
    expect(dragCarriesFiles({ types: [] })).toBe(false)
    expect(dragCarriesFiles(null)).toBe(false)
  })

  it('measures the longest backtick run', () => {
    expect(longestBacktickRun('no fences here')).toBe(0)
    expect(longestBacktickRun('a ``` b')).toBe(3)
    expect(longestBacktickRun('```` and ```')).toBe(4)
  })

  it('grows the fence past any fence inside the file', () => {
    // The interesting markdown files are the ones containing code blocks, so a
    // fixed three-backtick wrapper would terminate early on most real input.
    const block = fenceFile('notes.md', 'intro\n```ts\ncode\n```\nend', false)
    expect(block.startsWith('notes.md\n````\n')).toBe(true)
    expect(block.endsWith('\n````')).toBe(true)
    expect(block).toContain('```ts')
  })

  it('uses a three-backtick fence for ordinary prose', () => {
    expect(fenceFile('a.md', 'plain', false)).toBe('a.md\n```\nplain\n```')
  })

  it('marks truncated content inside the fence where it stays visible', () => {
    const block = fenceFile('big.md', 'start', true)
    expect(block).toContain(TRUNCATION_NOTICE)
    expect(block.endsWith('\n```')).toBe(true)
  })

  it('caps oversized content and reports the cut', () => {
    const capped = capContent('x'.repeat(MAX_INLINE_BYTES + 500))
    expect(capped.truncated).toBe(true)
    expect(capped.content).toHaveLength(MAX_INLINE_BYTES)
    const small = capContent('short')
    expect(small).toEqual({ content: 'short', truncated: false })
  })

  it('separates several files and leaves a trailing newline to type after', () => {
    expect(joinBlocks(['one', 'two'])).toBe('one\n\ntwo\n')
    expect(joinBlocks([])).toBe('')
  })
})

describe('staged text files', () => {
  const staged = (id: string, name: string, block: string) =>
    ({ id, name, block, chars: block.length, truncated: false })

  it('puts files before the typed question', () => {
    // The question is nearly always about the files, so a reader meets the
    // material before the ask.
    expect(composeMessage([staged('1', 'a.md', 'AAA')], 'what changed?'))
      .toBe('AAA\n\nwhat changed?')
  })

  it('sends files alone when nothing was typed', () => {
    expect(composeMessage([staged('1', 'a.md', 'AAA')], '')).toBe('AAA\n')
    expect(composeMessage([staged('1', 'a.md', 'AAA')], '   ')).toBe('AAA\n')
  })

  it('separates several files', () => {
    expect(composeMessage([staged('1', 'a.md', 'AAA'), staged('2', 'b.md', 'BBB')], 'go'))
      .toBe('AAA\n\nBBB\n\ngo')
  })

  it('leaves the draft alone when nothing is staged', () => {
    expect(composeMessage([], 'just a question')).toBe('just a question')
  })

  it('stages, unstages, and clears', () => {
    resetStaging()
    expect(stagedFiles()).toEqual([])
    stageFiles([staged('1', 'a.md', 'A'), staged('2', 'b.md', 'B')])
    expect(stagedFiles().map(f => f.id)).toEqual(['1', '2'])
    unstageFile('1')
    expect(stagedFiles().map(f => f.id)).toEqual(['2'])
    clearStaged()
    expect(stagedFiles()).toEqual([])
  })

  it('notifies subscribers on every change', () => {
    resetStaging()
    let calls = 0
    const stop = subscribeStaged(() => { calls += 1 })
    stageFiles([staged('1', 'a.md', 'A')])
    unstageFile('1')
    expect(calls).toBe(2)
    stop()
    stageFiles([staged('2', 'b.md', 'B')])
    expect(calls).toBe(2)
    resetStaging()
  })

  it('ignores no-op changes so React is not woken for nothing', () => {
    resetStaging()
    let calls = 0
    subscribeStaged(() => { calls += 1 })
    stageFiles([])
    unstageFile('missing')
    clearStaged()
    expect(calls).toBe(0)
    resetStaging()
  })

  it('tracks whether a tile rail is mounted', () => {
    // The drop handler falls back to pasting text when no rail can show a
    // tile, so this flag decides which behaviour a drop gets.
    resetStaging()
    expect(hasStagingHost()).toBe(false)
    const release = registerStagingHost()
    expect(hasStagingHost()).toBe(true)
    release()
    expect(hasStagingHost()).toBe(false)
    // Releasing twice must not drive the count negative and wedge it true.
    release()
    expect(hasStagingHost()).toBe(false)
  })

  it('resets every module-level value, so a reload starts clean', () => {
    stageFiles([staged('1', 'a.md', 'A')])
    registerStagingHost()
    resetStaging()
    expect(stagedFiles()).toEqual([])
    expect(hasStagingHost()).toBe(false)
  })
})
