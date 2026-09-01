/**
 * Deciding which dropped files are text, and turning them into composer text.
 *
 * Pure and DOM-free, so the qualification rules and the fencing are testable
 * without a renderer or a real DataTransfer.
 *
 * Context for the whole feature: the composer's attachment path carries images
 * only. `ComposerAttachment` serializes to `{ type: 'image', mediaType }` with
 * a four-way media-type union, so there is no wire form a Markdown file could
 * travel in even if the UI accepted it. Inlining the text into the draft is
 * therefore not a shortcut around the attachment pipeline — it is the only
 * route that exists, and it has the useful property of working regardless of
 * where the file sits or whether the agent can read that path itself.
 */

/** Extensions inlined regardless of what MIME type the platform reports. */
export const TEXT_EXTENSIONS: readonly string[] = [
  '.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt', '.text', '.rst', '.adoc',
]

/**
 * Largest file inlined whole, in bytes.
 *
 * Past this the content is cut and marked. A quarter-megabyte of Markdown is
 * already a very long prompt; silently sending several megabytes because a
 * file was dragged in by accident would be worse than a visible truncation the
 * user can see and edit in the composer before sending.
 */
export const MAX_INLINE_BYTES = 256 * 1024

/** Appended when a file was cut at the cap. Deliberately visible in the draft. */
export const TRUNCATION_NOTICE = '[truncated: file exceeds the inline limit]'

/** Minimal file shape this module needs; `File` satisfies it. */
export interface TextFileLike {
  readonly name: string
  readonly type: string
  readonly size: number
}

/** Lowercased extension of a filename, including the dot; '' when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

/**
 * Whether one dropped file should be inlined as text.
 *
 * Two ways in: a known text extension, or a `text/*` MIME type. The extension
 * check leads because platforms disagree about Markdown — some report
 * `text/markdown`, some `text/plain`, and some report nothing at all.
 * @param file - the dropped file.
 * @returns whether to inline it.
 */
export function isTextFile(file: TextFileLike): boolean {
  if (TEXT_EXTENSIONS.includes(extensionOf(file.name))) return true
  return file.type.startsWith('text/')
}

/**
 * Whether a drop should be handled here rather than by the image pipeline.
 *
 * Every file has to qualify. A mixed drop stays with upstream: intercepting it
 * would mean stopping the event, and stopping the event would drop the images
 * on the floor. Images are the case upstream handles well, so they win.
 * @param files - every file in the drop.
 * @returns whether this feature owns the drop.
 */
export function ownsDrop(files: readonly TextFileLike[]): boolean {
  return files.length > 0 && files.every(isTextFile)
}

/**
 * Whether a drag in progress is carrying files at all.
 *
 * This deliberately asks nothing about what kind of files. A drag cannot be
 * inspected: Chromium withholds the contents of `dataTransfer.items` until the
 * drop, so during dragover the per-file types read as empty or the list is
 * empty outright, and filenames are never exposed at any point. Upstream's own
 * handler tests `types.includes('Files')` for exactly this reason, and two
 * attempts here to be cleverer than that both failed to fire.
 *
 * Claiming the drag matters because refusing it lets upstream's dragover set
 * `dropEffect = 'none'`, after which Chromium fires no drop event whatsoever.
 * The file then cannot be read even though its name would have identified it
 * instantly. Claiming the drag is what makes the drop reachable at all.
 *
 * The kind of file is decided at the drop, where {@link ownsDrop} finally has
 * filenames to read. A drag claimed here and refused there is handed straight
 * back to upstream, which is why claiming broadly costs nothing.
 * @param transfer - the drag's data transfer.
 * @returns whether the drag carries files.
 */
export function dragCarriesFiles(transfer: { types: readonly string[] } | null): boolean {
  return transfer !== null && [...transfer.types].includes('Files')
}

/**
 * The longest run of backticks in some text.
 * @param text - the text to scan.
 * @returns the run length, 0 when there are none.
 */
export function longestBacktickRun(text: string): number {
  let longest = 0
  let run = 0
  for (const character of text) {
    if (character === '`') {
      run += 1
      if (run > longest) longest = run
      continue
    }
    run = 0
  }
  return longest
}

/**
 * Wrap one file's content as a fenced block labelled with its name.
 *
 * The fence is grown past the longest backtick run in the content, so a
 * Markdown file containing its own fenced code blocks — which is most of the
 * interesting ones — does not terminate the wrapper early.
 * @param name - the file name, used as the block's label.
 * @param content - the file's text.
 * @param truncated - whether the content was cut at the cap.
 * @returns the block to insert into the draft.
 */
export function fenceFile(name: string, content: string, truncated: boolean): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1))
  const body = truncated ? `${content}\n${TRUNCATION_NOTICE}` : content
  // The trailing newline inside the fence keeps the closing marker on its own
  // line for content that does not end with one.
  return `${name}\n${fence}\n${body}\n${fence}`
}

/**
 * Join several fenced files into one insertion.
 * @param blocks - already-fenced blocks in drop order.
 * @returns the text to paste into the composer.
 */
export function joinBlocks(blocks: readonly string[]): string {
  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`
}

/**
 * Cut text to the byte cap on a character boundary.
 *
 * The cap is expressed in bytes because that is what the size check upstream
 * of it reports, but slicing has to happen in code units or the result can end
 * mid-character. Slicing to the cap in characters is always at or under the
 * cap in bytes for UTF-8, so one pass is enough.
 * @param text - decoded file content.
 * @returns the content and whether it was cut.
 */
export function capContent(text: string): { content: string; truncated: boolean } {
  if (text.length <= MAX_INLINE_BYTES) return { content: text, truncated: false }
  return { content: text.slice(0, MAX_INLINE_BYTES), truncated: true }
}
