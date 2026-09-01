/**
 * TextDropTiles: the staged-file rail above the composer.
 *
 * Dropping a Markdown file used to paste its whole text into the draft, which
 * works but buries the composer. This renders each dropped file as a compact
 * tile instead, and folds the text back in at the moment the message is sent.
 *
 * The entry sits in `conversation.input.dock`, a session-scoped list slot
 * rendered full width above the composer card. Session scope is what supplies
 * `inputActions`, which is the only sanctioned way to write the draft and to
 * submit it.
 *
 * Why the send gesture is intercepted at all: upstream's attachment pipeline
 * carries images only (`{ type: 'image', mediaType }` over a four-way union),
 * so a Markdown file has no wire form of its own. Its text has to travel as
 * message text, and the only way to keep it out of the visible draft until
 * then is to put it there as the message leaves.
 *
 * Two gestures send a message, and both are claimed:
 *
 * - Enter in the composer, which is the common path and the reliable one.
 * - A click on the composer's submit control, which is found structurally
 *   because it carries no stable attribute and its label is localized.
 *
 * If the click path ever stops matching, the tiles stay on screen and the
 * message sends without them. That is the failure this design chooses: visibly
 * incomplete and recoverable by pressing Enter, rather than a silent send that
 * drops the file.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  clearStaged,
  composeMessage,
  registerStagingHost,
  stagedFiles,
  subscribeStaged,
  unstageFile,
  type StagedFile,
} from './text-drop-store.ts'
import { COMPOSER_SELECTOR } from './text-drop.ts'

/** Renderer-composed props: the dock seat plus this feature's dictionary. */
export type TextDropTilesProps =
  PropsRuntime<'conversation.input.dock'> & PropsLocale<'desktop.textDrop'>

/**
 * Settle time between writing the composed draft and submitting it.
 *
 * `setDraft` reaches the Lexical editor, and `submit` reads the draft back out
 * of the input machine. One frame is enough for the write to land and is
 * imperceptible; submitting in the same tick races the write and can send the
 * message without the files.
 */
const SETTLE_MS = 32

/** Render the staged-file rail, and own the send gestures while it has files. */
export function TextDropTiles(props: TextDropTilesProps) {
  // `inputActions` arrives from the session standard kit. Guarding rather than
  // trusting it, for the same reason WorkspaceDecor guards `useWorkspaces`: a
  // throw inside a slot entry latches its error boundary for the session.
  if (typeof props.inputActions?.setDraft !== 'function') return null
  return <TextDropTilesBody {...props} />
}

/** The rail proper, mounted only with usable input actions. */
function TextDropTilesBody({ t, inputActions, useInput }: TextDropTilesProps) {
  const files = useSyncExternalStore(subscribeStaged, stagedFiles, stagedFiles)
  const draft = useInput(state => state.draft)
  // The send path reads these through a ref so the document listeners below do
  // not need rebuilding on every keystroke.
  const latest = useRef({ files, draft, inputActions })
  latest.current = { files, draft, inputActions }

  // Tell the drop handler a rail exists. Without one it pastes text into the
  // draft instead, because a staged file nobody can see is worse than a noisy
  // composer.
  useEffect(() => registerStagingHost(), [])

  /** Compose staged files with the typed draft and send the result. */
  const sendWithFiles = useCallback((): void => {
    const { files: staged, draft: typed, inputActions: actions } = latest.current
    if (staged.length === 0) return
    actions.setDraft(composeMessage(staged, typed))
    clearStaged()
    window.setTimeout(() => { actions.submit() }, SETTLE_MS)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    /** The composer's submit control: the last enabled button in its card. */
    const submitControl = (): HTMLButtonElement | null => {
      const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
      const card = composer?.closest<HTMLElement>('[data-slot="conversation.composer.bar"]')
        ?? composer?.parentElement?.parentElement
        ?? null
      if (card === null) return null
      const buttons = [...card.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
      return buttons.at(-1) ?? null
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (latest.current.files.length === 0) return
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
      const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
      if (composer === null || !(event.target instanceof Node) || !composer.contains(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      sendWithFiles()
    }

    const onClick = (event: MouseEvent): void => {
      if (latest.current.files.length === 0) return
      if (!(event.target instanceof Element)) return
      const button = event.target.closest('button')
      if (button === null || button !== submitControl()) return
      event.preventDefault()
      event.stopPropagation()
      sendWithFiles()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [sendWithFiles])

  if (files.length === 0) return null
  return (
    <div className="dshFileTiles" role="list" aria-label={t('tiles.aria')}>
      {files.map(file => (
        <FileTile key={file.id} file={file} t={t} onRemove={() => { unstageFile(file.id) }} />
      ))}
    </div>
  )
}

/** One staged file. */
function FileTile({ file, t, onRemove }: {
  file: StagedFile
  t: TextDropTilesProps['t']
  onRemove: () => void
}) {
  return (
    <div className="dshFileTile" role="listitem">
      <span className="dshFileTileIcon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M8 1.5H3.75v11h6.5V3.75z" />
          <path d="M8 1.5v2.25h2.25" />
        </svg>
      </span>
      <span className="dshFileTileText">
        <span className="dshFileTileName" title={file.name}>{file.name}</span>
        <span className="dshFileTileMeta">
          {file.truncated
            ? t('tiles.metaTruncated', { chars: file.chars })
            : t('tiles.meta', { chars: file.chars })}
        </span>
      </span>
      <button
        type="button"
        className="dshFileTileRemove"
        aria-label={t('tiles.remove', { name: file.name })}
        onClick={onRemove}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" focusable="false">
          <path d="M3.75 3.75l6.5 6.5M10.25 3.75l-6.5 6.5" />
        </svg>
      </button>
    </div>
  )
}
