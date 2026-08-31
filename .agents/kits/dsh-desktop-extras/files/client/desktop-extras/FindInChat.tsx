/**
 * FindInChat: the Option+F find bar for the conversation transcript.
 *
 * The entry sits in `shell.overlay`, so it is mounted for the whole session
 * and owns both the shortcut listener and the panel's open state. Nothing
 * outside this component needs to know the panel exists.
 *
 * Escape is handled from the field only, never from the document. A global
 * Escape listener would race the composer's own stop-generation handling and
 * whatever modal happens to be open; a find bar is not worth that.
 */
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { FIND_IN_CHAT_BINDING, matches as matchesBinding } from './keybindings.ts'
import type { FindInChatLocaleKey } from './find-in-chat-locales.ts'
import {
  clearMatches,
  paintMatches,
  revealMatch,
  searchTranscript,
  type TranscriptMatch,
} from './transcript-search.ts'

/** Renderer-composed props for the find-in-chat overlay entry. */
export type FindInChatProps = PropsLocale<'desktop.find'>

/** Settle time after a keystroke before the transcript is re-scanned. */
const TYPING_DEBOUNCE_MS = 120

/** Settle time after transcript mutations (streaming, paging) before rescan. */
const MUTATION_DEBOUNCE_MS = 300

/**
 * Icons are inline rather than pulled from `dsh-client-ui-primitives`. No
 * Desktop client file imports that package: it ships CSS modules, which the
 * node-environment unit tests cannot load, so importing it here would break
 * every suite that reaches this module through the plugin entry.
 */
function Glyph({ d }: { d: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}

/** Chevron pointing up, for the previous match. */
const CHEVRON_UP = 'M3.5 8.75 7 5.25l3.5 3.5'

/** Chevron pointing down, for the next match. */
const CHEVRON_DOWN = 'M3.5 5.25 7 8.75l3.5-3.5'

/** Diagonal cross, for close. */
const CROSS = 'M3.75 3.75l6.5 6.5M10.25 3.75l-6.5 6.5'

/** Locale keys this component reads from its bound dictionary. */
const KEYS: Record<'placeholder' | 'count' | 'empty' | 'previous' | 'next' | 'close', FindInChatLocaleKey> = {
  placeholder: 'placeholder',
  count: 'count',
  empty: 'empty',
  previous: 'previous',
  next: 'next',
  close: 'close',
}

/** A scan result, carried with the query it answers. */
interface ScanResult {
  /** The query these matches were found for. */
  readonly query: string
  /** Matches in document order. */
  readonly matches: readonly TranscriptMatch[]
}

/** Nothing scanned yet. */
const NO_RESULT: ScanResult = { query: '', matches: [] }

/** Render the find bar and own the shortcut that opens it. */
export function FindInChat({ t }: FindInChatProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Matches travel with their query so a scan that has not caught up yet can
  // never be mistaken for an answer to what is currently typed. Without that
  // pairing, the reveal below scrolls to a match from the previous query and
  // then refuses to correct itself.
  const [result, setResult] = useState<ScanResult>(NO_RESULT)
  const [active, setActive] = useState(0)
  const field = useRef<HTMLInputElement | null>(null)
  // The query whose first match has already been scrolled to. Re-scans caused
  // by streaming must not yank the view back to the top of the results.
  const revealedFor = useRef<string | null>(null)

  const matches = result.matches

  const close = useCallback(() => {
    setOpen(false)
    setResult(NO_RESULT)
    setActive(0)
    clearMatches()
  }, [])

  // Option+F, captured before the composer sees it. On macOS this chord types
  // `ƒ`, which is exactly why keybindings.ts matches on `code`.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matchesBinding(event, FIND_IN_CHAT_BINDING)) return
      event.preventDefault()
      setOpen(true)
      // Focus after the panel has mounted for this frame.
      window.requestAnimationFrame(() => {
        const input = field.current
        if (input === null) return
        input.focus()
        input.select()
      })
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [])

  // Scan on a settled query, and again whenever the transcript changes: React
  // replaces text nodes as a turn streams, which collapses the Ranges held
  // from the previous scan.
  useEffect(() => {
    if (!open) return undefined
    let disposed = false
    let mutationTimer = 0
    const scan = (): void => {
      if (disposed) return
      const found = searchTranscript(query)
      setResult({ query, matches: found })
      setActive(previous => (found.length === 0 ? 0 : Math.min(previous, found.length - 1)))
    }
    const typingTimer = window.setTimeout(scan, TYPING_DEBOUNCE_MS)
    const root = document.querySelector('[data-slot="conversation"]') ?? document.body
    const observer = new MutationObserver(() => {
      window.clearTimeout(mutationTimer)
      mutationTimer = window.setTimeout(scan, MUTATION_DEBOUNCE_MS)
    })
    observer.observe(root, { subtree: true, childList: true, characterData: true })
    return () => {
      disposed = true
      window.clearTimeout(typingTimer)
      window.clearTimeout(mutationTimer)
      observer.disconnect()
    }
  }, [open, query])

  useEffect(() => {
    if (!open) return
    paintMatches(matches, matches.length === 0 ? -1 : active)
  }, [open, matches, active])

  // Reveal the first hit once per query. Keyed on the scanned query, not the
  // typed one, so a rescan triggered by streaming leaves the view where the
  // user put it.
  useEffect(() => {
    if (!open) {
      revealedFor.current = null
      return
    }
    if (result.matches.length === 0 || revealedFor.current === result.query) return
    revealedFor.current = result.query
    const first = result.matches[0]
    if (first !== undefined) revealMatch(first)
  }, [open, result])

  // Highlights outlive React's tree, so drop them when the entry unloads.
  useEffect(() => () => { clearMatches() }, [])

  const step = (delta: number): void => {
    if (matches.length === 0) return
    const next = (active + delta + matches.length) % matches.length
    setActive(next)
    const match = matches[next]
    if (match !== undefined) revealMatch(match)
  }

  const onFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      step(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      step(-1)
    }
  }

  if (!open) return null

  const total = matches.length
  // While a keystroke is still settling, the last scan's count stays on screen
  // rather than blinking through "No results" on the way to an answer.
  const settled = result.query === query
  const empty = settled && query.trim().length > 0 && total === 0
  const count = empty
    ? t(KEYS.empty)
    : total === 0 ? '' : t(KEYS.count, { current: active + 1, total })
  const previousLabel = t(KEYS.previous)
  const nextLabel = t(KEYS.next)
  const closeLabel = t(KEYS.close)

  return (
    <div className="dshFindInChat" role="search">
      <input
        ref={field}
        className="dshFindInChatField"
        type="text"
        autoFocus
        spellCheck={false}
        placeholder={t(KEYS.placeholder)}
        aria-label={t(KEYS.placeholder)}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={onFieldKeyDown}
      />
      <span className="dshFindInChatCount" data-empty={empty ? 'true' : undefined}>{count}</span>
      <span className="dshFindInChatDivider" aria-hidden="true" />
      <button
        type="button"
        className="dshFindInChatButton"
        aria-label={previousLabel}
        title={previousLabel}
        disabled={total === 0}
        onClick={() => { step(-1) }}
      >
        <Glyph d={CHEVRON_UP} />
      </button>
      <button
        type="button"
        className="dshFindInChatButton"
        aria-label={nextLabel}
        title={nextLabel}
        disabled={total === 0}
        onClick={() => { step(1) }}
      >
        <Glyph d={CHEVRON_DOWN} />
      </button>
      <button
        type="button"
        className="dshFindInChatButton"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={close}
      >
        <Glyph d={CROSS} />
      </button>
    </div>
  )
}
