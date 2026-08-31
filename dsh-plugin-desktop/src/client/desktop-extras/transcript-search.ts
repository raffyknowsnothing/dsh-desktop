/**
 * The DOM half of find-in-chat: read the rendered transcript, turn matches
 * into Ranges, and paint them with the CSS Custom Highlight API.
 *
 * Two upstream anchors carry this, both of them documented contracts rather
 * than scraped class names. `[data-slot="<key>"]` is the renderer's stable
 * wrapper around every slot render site, so `[data-slot="conversation"]`
 * bounds the search to the conversation column. `[data-chat-anchor-key]` is
 * the per-row identity ui-chat puts on each transcript node and uses for its
 * own scroll anchoring, so it names exactly the rows worth searching and
 * leaves the composer, the header, and the sidebar out of it.
 *
 * Highlighting goes through `CSS.highlights` rather than wrapping matches in
 * elements: React owns this DOM, and injected wrapper nodes would be torn out
 * on the next render (and would fight the reconciler in the meantime). A
 * Highlight paints over the existing text and touches no nodes at all.
 *
 * Only loaded turns are searchable. The transcript pages older messages in on
 * demand, and what has not been fetched is not in the DOM to be found.
 */

import {
  BLOCK_BOUNDARY,
  buildSearchIndex,
  chunkRangeOf,
  findMatches,
  foldQuery,
} from './transcript-index.ts'

/** Highlight registry name for every match. */
const MATCH_HIGHLIGHT = 'dsh-find-match'

/** Highlight registry name for the one match the user is sitting on. */
const CURRENT_HIGHLIGHT = 'dsh-find-current'

/** One located match: the Range to paint and the row that holds it. */
export interface TranscriptMatch {
  /** Range covering the matched text. */
  readonly range: Range
  /** The transcript row the match lives in, for scrolling into view. */
  readonly row: HTMLElement
}

/** Elements whose text is chrome or editable input, never transcript content. */
const OPAQUE_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'])

/**
 * The conversation column, or the document body when the slot anchor is
 * absent (a shell that renders no conversation slot).
 */
function transcriptRoot(): ParentNode {
  return document.querySelector('[data-slot="conversation"]') ?? document.body
}

/** Transcript rows in document order, skipping ones the shell has hidden. */
function transcriptRows(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-chat-anchor-key]:not([hidden])')]
}

/** Collect the visible text nodes of one row, in document order. */
function textNodesOf(row: HTMLElement): Text[] {
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT
      const element = node as Element
      if (OPAQUE_TAGS.has(element.tagName)) return NodeFilter.FILTER_REJECT
      if (element.hasAttribute('hidden')) return NodeFilter.FILTER_REJECT
      if (element.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT
      // Elements themselves contribute nothing; SKIP keeps their text.
      return NodeFilter.FILTER_SKIP
    },
  })
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text)
  }
  return nodes
}

/**
 * Every occurrence of a query in the loaded transcript, in document order.
 * @param query - raw text typed into the find field.
 * @param limit - the most matches to return.
 * @returns located matches; empty for a query that folds to nothing.
 */
export function searchTranscript(query: string, limit = 1000): TranscriptMatch[] {
  const folded = foldQuery(query)
  if (folded.length === 0) return []

  // Chunks and their source nodes stay index-aligned; a boundary chunk owns no
  // node, and no match can land on one, so the lookup below always resolves.
  const chunks: string[] = []
  const owners: (Text | null)[] = []
  const rows: (HTMLElement | null)[] = []
  for (const row of transcriptRows(transcriptRoot())) {
    if (chunks.length > 0) {
      chunks.push(BLOCK_BOUNDARY)
      owners.push(null)
      rows.push(null)
    }
    for (const node of textNodesOf(row)) {
      chunks.push(node.data)
      owners.push(node)
      rows.push(row)
    }
  }

  const index = buildSearchIndex(chunks)
  const matches: TranscriptMatch[] = []
  for (const match of findMatches(index, folded, limit)) {
    const position = chunkRangeOf(index, match)
    if (position === undefined) continue
    const startNode = owners[position.start.chunk]
    const endNode = owners[position.end.chunk]
    const row = rows[position.start.chunk]
    if (startNode === null || startNode === undefined) continue
    if (endNode === null || endNode === undefined) continue
    if (row === null || row === undefined) continue
    const range = document.createRange()
    range.setStart(startNode, Math.min(position.start.offset, startNode.data.length))
    range.setEnd(endNode, Math.min(position.end.offset, endNode.data.length))
    // A match inside a collapsed disclosure lays out no boxes. Stepping onto
    // one would scroll nowhere and highlight nothing, so drop it.
    if (range.getClientRects().length === 0) continue
    matches.push({ range, row })
  }
  return matches
}

/** The highlight registry, or undefined where the API is unavailable. */
function registry(): HighlightRegistry | undefined {
  if (typeof CSS === 'undefined') return undefined
  return (CSS as { highlights?: HighlightRegistry }).highlights
}

/**
 * Paint the match set, with the active match on its own highlight so it can
 * be styled apart from the rest.
 * @param matches - every located match.
 * @param active - index of the active match, or -1 for none.
 */
export function paintMatches(matches: readonly TranscriptMatch[], active: number): void {
  const highlights = registry()
  if (highlights === undefined) return
  if (matches.length === 0) {
    clearMatches()
    return
  }
  const all = new Highlight()
  const current = new Highlight()
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    if (match === undefined) continue
    if (i === active) current.add(match.range)
    else all.add(match.range)
  }
  highlights.set(MATCH_HIGHLIGHT, all)
  highlights.set(CURRENT_HIGHLIGHT, current)
}

/** Remove both highlights. Safe to call when nothing was ever painted. */
export function clearMatches(): void {
  const highlights = registry()
  if (highlights === undefined) return
  highlights.delete(MATCH_HIGHLIGHT)
  highlights.delete(CURRENT_HIGHLIGHT)
}

/**
 * Scroll one match to the middle of its scroll container.
 * @param match - the match to reveal.
 */
export function revealMatch(match: TranscriptMatch): void {
  const start = match.range.startContainer
  const element = start.nodeType === Node.ELEMENT_NODE
    ? (start as Element)
    : start.parentElement
  const target = element ?? match.row
  target.scrollIntoView({ block: 'center', inline: 'nearest' })
}
