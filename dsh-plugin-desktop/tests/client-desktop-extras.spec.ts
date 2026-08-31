import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FIND_IN_CHAT_BINDING,
  PREFERENCES_BINDINGS,
  matches,
  matchesAny,
} from '../src/client/desktop-extras/keybindings.ts'
import {
  BLOCK_BOUNDARY,
  buildSearchIndex,
  chunkRangeOf,
  findMatches,
  foldQuery,
} from '../src/client/desktop-extras/transcript-index.ts'
import { SETTINGS_TRIGGER_SELECTOR } from '../src/client/desktop-extras/preferences-shortcut.ts'

/** A keyboard event stand-in carrying only what the matcher reads. */
function key(code: string, modifiers: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>> = {}) {
  return {
    code,
    altKey: modifiers.alt ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
  } as KeyboardEvent
}

describe('desktop extras keybindings', () => {
  it('matches Option+F by physical key, which is what macOS leaves intact', () => {
    // macOS reports `key` as 'ƒ' for this chord, so only `code` can identify it.
    expect(matches(key('KeyF', { alt: true }), FIND_IN_CHAT_BINDING)).toBe(true)
  })

  it('does not fire find-in-chat for a bare F or for extra modifiers', () => {
    expect(matches(key('KeyF'), FIND_IN_CHAT_BINDING)).toBe(false)
    expect(matches(key('KeyF', { meta: true }), FIND_IN_CHAT_BINDING)).toBe(false)
    expect(matches(key('KeyF', { alt: true, meta: true }), FIND_IN_CHAT_BINDING)).toBe(false)
    expect(matches(key('KeyF', { alt: true, shift: true }), FIND_IN_CHAT_BINDING)).toBe(false)
    expect(matches(key('KeyG', { alt: true }), FIND_IN_CHAT_BINDING)).toBe(false)
  })

  it('accepts Cmd+comma and Ctrl+comma for preferences, but not the bare key', () => {
    expect(matchesAny(key('Comma', { meta: true }), PREFERENCES_BINDINGS)).toBe(true)
    expect(matchesAny(key('Comma', { ctrl: true }), PREFERENCES_BINDINGS)).toBe(true)
    expect(matchesAny(key('Comma'), PREFERENCES_BINDINGS)).toBe(false)
    expect(matchesAny(key('Comma', { meta: true, shift: true }), PREFERENCES_BINDINGS)).toBe(false)
  })
})

describe('transcript search index', () => {
  it('collapses markup whitespace so a query spanning elements still matches', () => {
    const index = buildSearchIndex(['hello', '\n      ', 'world'])
    expect(index.text).toBe('hello world')
    expect(findMatches(index, foldQuery('hello world'))).toEqual([{ start: 0, end: 11 }])
  })

  it('folds case on both sides without shifting the offset map', () => {
    const index = buildSearchIndex(['Deploy the Harness'])
    expect(index.text).toBe('deploy the harness')
    expect(index.chunk).toHaveLength(index.text.length)
    expect(index.offset).toHaveLength(index.text.length)
    expect(findMatches(index, foldQuery('HARNESS'))).toEqual([{ start: 11, end: 18 }])
  })

  it('keeps characters whose lowercase form would change their length', () => {
    // 'İ' lowercases to two UTF-16 units, which would desync the offset map.
    const index = buildSearchIndex(['İstanbul'])
    expect(index.text).toHaveLength('İstanbul'.length)
    expect(findMatches(index, foldQuery('İstanbul'))).toHaveLength(1)
  })

  it('refuses to match across a message boundary', () => {
    const index = buildSearchIndex(['ship it', BLOCK_BOUNDARY, 'later'])
    expect(findMatches(index, foldQuery('it later'))).toEqual([])
    expect(findMatches(index, foldQuery('ship it'))).toHaveLength(1)
  })

  it('reports non-overlapping matches and honours the cap', () => {
    const index = buildSearchIndex(['aaaa'])
    expect(findMatches(index, foldQuery('aa'))).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ])
    expect(findMatches(index, foldQuery('a'), 2)).toHaveLength(2)
  })

  it('treats an all-whitespace query as no query', () => {
    const index = buildSearchIndex(['anything'])
    expect(foldQuery('   \n ')).toBe('')
    expect(findMatches(index, foldQuery('   \n '))).toEqual([])
  })

  it('maps a match spanning two chunks back to both source offsets', () => {
    const index = buildSearchIndex(['ru', 'ntime'])
    const match = findMatches(index, foldQuery('untim'))[0]
    expect(match).toBeDefined()
    expect(chunkRangeOf(index, match!)).toEqual({
      start: { chunk: 0, offset: 1 },
      end: { chunk: 1, offset: 4 },
    })
  })

  it('maps a collapsed space back to the first character of its run', () => {
    const index = buildSearchIndex(['a', '   ', 'b'])
    const match = findMatches(index, foldQuery('a b'))[0]
    expect(chunkRangeOf(index, match!)).toEqual({
      start: { chunk: 0, offset: 0 },
      end: { chunk: 2, offset: 1 },
    })
  })
})

describe('preferences shortcut selector', () => {
  it('matches the settings trigger the upstream shell renders', () => {
    // The two contracts the selector rides: the renderer's stable
    // `[data-slot="<key>"]` anchor around every slot render site, and the
    // settings shell's `aria-haspopup="dialog"` trigger inside it.
    const markup = renderToStaticMarkup(
      createElement('div', { 'data-slot': 'sidebar.settings', style: { display: 'contents' } },
        createElement('button', {
          type: 'button',
          'aria-haspopup': 'dialog',
          'aria-expanded': false,
        }, 'Settings'),
      ),
    )
    expect(markup).toContain('data-slot="sidebar.settings"')
    expect(markup).toContain('aria-haspopup="dialog"')
    expect(markup).toContain('aria-expanded="false"')
    expect(SETTINGS_TRIGGER_SELECTOR)
      .toBe('[data-slot="sidebar.settings"] button[aria-haspopup="dialog"]')
  })
})
