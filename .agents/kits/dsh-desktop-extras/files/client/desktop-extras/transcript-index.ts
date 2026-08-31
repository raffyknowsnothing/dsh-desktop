/**
 * The search core behind find-in-chat, kept free of the DOM so it can be
 * tested directly.
 *
 * A transcript reaches this module as an ordered list of raw text chunks (one
 * per DOM text node, with a boundary chunk between messages). The index folds
 * that list into a single searchable string and remembers, for every character
 * it keeps, which chunk and which offset inside that chunk it came from. The
 * caller maps a match back to a DOM Range through those two arrays.
 *
 * Two foldings happen on the way in, and the query gets exactly the same
 * treatment so both sides agree:
 *
 * - Runs of whitespace collapse to one space, because markup splits a rendered
 *   sentence across elements and indentation lands in the text nodes. Without
 *   this, searching "hello world" misses a paragraph that renders those words
 *   with a newline between them.
 * - Characters case-fold only when the lowercase form is still a single UTF-16
 *   unit, so the offset arrays stay aligned with the text. The handful of
 *   characters that grow when lowercased (Turkish dotted capital I, for one)
 *   pass through unchanged on both sides and still match each other.
 */

/**
 * Chunk text that separates two messages. NUL never appears in rendered
 * transcript text and is stripped from queries, so no match can span it.
 */
export const BLOCK_BOUNDARY = '\u0000'

/** A folded transcript plus the per-character map back to its source chunks. */
export interface SearchIndex {
  /** Whitespace-collapsed, case-folded transcript text. */
  readonly text: string
  /** For each character of `text`, the index of the chunk it came from. */
  readonly chunk: readonly number[]
  /** For each character of `text`, its offset inside that chunk. */
  readonly offset: readonly number[]
}

/** A half-open match range over {@link SearchIndex.text}. */
export interface SearchMatch {
  readonly start: number
  readonly end: number
}

/** Whitespace this module collapses, including the non-breaking space. */
function isSpace(character: string): boolean {
  return character === ' '
    || character === '\t'
    || character === '\n'
    || character === '\r'
    || character === '\f'
    || character === '\u00a0'
}

/** Lowercase one UTF-16 unit only when doing so preserves its length. */
function fold(character: string): string {
  const lowered = character.toLowerCase()
  return lowered.length === character.length ? lowered : character
}

/**
 * Fold an ordered chunk list into one searchable index.
 * @param chunks - raw text per source chunk, in document order.
 * @returns the folded text and its per-character source map.
 */
export function buildSearchIndex(chunks: readonly string[]): SearchIndex {
  const text: string[] = []
  const chunk: number[] = []
  const offset: number[] = []
  // The first whitespace character of a run still waiting to be emitted as a
  // single space. Held back so a run that ends the transcript, or that runs
  // into a block boundary, contributes nothing.
  let pendingSpace: { chunk: number; offset: number } | undefined

  const emit = (character: string, from: number, at: number): void => {
    text.push(character)
    chunk.push(from)
    offset.push(at)
  }

  for (let c = 0; c < chunks.length; c += 1) {
    const raw = chunks[c] ?? ''
    for (let i = 0; i < raw.length; i += 1) {
      const character = raw[i] ?? ''
      if (character === BLOCK_BOUNDARY) {
        pendingSpace = undefined
        emit(BLOCK_BOUNDARY, c, i)
        continue
      }
      if (isSpace(character)) {
        const previous = text[text.length - 1]
        const openable = previous !== undefined && previous !== BLOCK_BOUNDARY
        if (openable && pendingSpace === undefined) pendingSpace = { chunk: c, offset: i }
        continue
      }
      if (pendingSpace !== undefined) {
        emit(' ', pendingSpace.chunk, pendingSpace.offset)
        pendingSpace = undefined
      }
      emit(fold(character), c, i)
    }
  }
  return { text: text.join(''), chunk, offset }
}

/**
 * Fold a user query the same way {@link buildSearchIndex} folds a transcript.
 * @param query - raw text typed into the find field.
 * @returns the comparable query, empty when the query holds nothing to match.
 */
export function foldQuery(query: string): string {
  let text = ''
  let pendingSpace = false
  for (let i = 0; i < query.length; i += 1) {
    const character = query[i] ?? ''
    if (character === BLOCK_BOUNDARY) continue
    if (isSpace(character)) {
      if (text.length > 0) pendingSpace = true
      continue
    }
    if (pendingSpace) {
      text += ' '
      pendingSpace = false
    }
    text += fold(character)
  }
  return text
}

/**
 * Every non-overlapping occurrence of a folded query, in document order.
 * @param index - the folded transcript.
 * @param query - a query already passed through {@link foldQuery}.
 * @param limit - stop after this many matches, so a one-character query on a
 *   long transcript cannot stall the renderer.
 * @returns the matches found, capped at `limit`.
 */
export function findMatches(
  index: SearchIndex,
  query: string,
  limit = 1000,
): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (query.length === 0 || limit <= 0) return matches
  let from = 0
  for (;;) {
    const start = index.text.indexOf(query, from)
    if (start < 0) break
    matches.push({ start, end: start + query.length })
    if (matches.length >= limit) break
    from = start + query.length
  }
  return matches
}

/** One end of a match, addressed in the caller's chunk coordinates. */
export interface ChunkPosition {
  readonly chunk: number
  readonly offset: number
}

/**
 * Map a match back to the chunk positions its Range should span.
 * @param index - the folded transcript the match came from.
 * @param match - a match produced by {@link findMatches}.
 * @returns the start and end chunk positions, or undefined when the map has no
 *   entry for the match (an index and match from different builds).
 */
export function chunkRangeOf(
  index: SearchIndex,
  match: SearchMatch,
): { readonly start: ChunkPosition; readonly end: ChunkPosition } | undefined {
  const startChunk = index.chunk[match.start]
  const startOffset = index.offset[match.start]
  const endChunk = index.chunk[match.end - 1]
  const endOffset = index.offset[match.end - 1]
  if (startChunk === undefined || startOffset === undefined) return undefined
  if (endChunk === undefined || endOffset === undefined) return undefined
  return {
    start: { chunk: startChunk, offset: startOffset },
    // The map stores where each kept character began, so the exclusive end is
    // one past the last matched character.
    end: { chunk: endChunk, offset: endOffset + 1 },
  }
}
