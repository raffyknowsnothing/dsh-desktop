/**
 * The staging area between the document-level drop handler and the composer
 * tile rail.
 *
 * The two halves cannot talk directly. Drops are caught at the document,
 * because that is the only place a file dragged anywhere over the window can
 * be seen; the tiles render inside a session-scoped slot, which mounts and
 * unmounts with the current Session. This store is the seam, and it is
 * deliberately the smallest one that works: a list, a subscribe, and a reset.
 *
 * It is module-level state, which this codebase otherwise avoids because a
 * module-level handle pins identity across plugin reloads. The exception is
 * justified here and bounded by it: `installTextDrop` clears the store when it
 * installs, so a reload starts empty rather than inheriting files whose tiles
 * no longer exist.
 */

/** One file staged for the next message. */
export interface StagedFile {
  /** Stable local identity, for keying tiles and removal. */
  readonly id: string
  /** File name, shown on the tile. */
  readonly name: string
  /** Full text, already capped and fenced by the drop handler. */
  readonly block: string
  /** Character count of the original content, shown on the tile. */
  readonly chars: number
  /** Whether the content was cut at the inline cap. */
  readonly truncated: boolean
}

type Listener = () => void

let staged: readonly StagedFile[] = []
const listeners = new Set<Listener>()

/** Mint a staged-file id. */
export function mintStagedId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Current staged files. Stable identity between changes, for `useSyncExternalStore`. */
export function stagedFiles(): readonly StagedFile[] {
  return staged
}

/**
 * Subscribe to staging changes.
 * @param listener - called after every change.
 * @returns the unsubscribe function.
 */
export function subscribeStaged(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Publish the current list to every subscriber. */
function publish(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (error) {
      // One bad subscriber must not stop the others, and must not throw back
      // into the drop handler that triggered the change.
      console.error('dsh-plugin-desktop: staged-file subscriber failed', error)
    }
  }
}

/**
 * Stage files for the next message.
 * @param files - files to append, in drop order.
 */
export function stageFiles(files: readonly StagedFile[]): void {
  if (files.length === 0) return
  staged = [...staged, ...files]
  publish()
}

/**
 * Remove one staged file.
 * @param id - the file to drop.
 */
export function unstageFile(id: string): void {
  const next = staged.filter(file => file.id !== id)
  if (next.length === staged.length) return
  staged = next
  publish()
}

/** Clear the whole staging area, after a send or on reinstall. */
export function clearStaged(): void {
  if (staged.length === 0) return
  staged = []
  publish()
}

/**
 * Whether a tile rail is mounted to show staged files.
 *
 * The drop handler needs this: with no rail the tiles would be invisible, and
 * silently staging a file the user cannot see is worse than the older
 * behaviour of pasting its text into the draft. So the handler falls back to
 * pasting whenever this is false, which is the no-Session case.
 */
let hostCount = 0

/**
 * Register a mounted tile rail.
 * @returns the deregister function.
 */
export function registerStagingHost(): () => void {
  hostCount += 1
  return () => { hostCount = Math.max(0, hostCount - 1) }
}

/** Whether at least one tile rail is mounted. */
export function hasStagingHost(): boolean {
  return hostCount > 0
}

/**
 * Reset every module-level value. Called when the drop handler installs, so a
 * plugin reload cannot inherit files or a host count from the generation
 * before it.
 */
export function resetStaging(): void {
  staged = []
  hostCount = 0
  listeners.clear()
}

/**
 * Compose the message body from staged files and the typed draft.
 *
 * Files lead and the typed text follows, because the question is nearly always
 * about the files, and a reader (human or model) meets the material before the
 * ask.
 * @param files - staged files in order.
 * @param draft - what the user typed.
 * @returns the text to submit.
 */
export function composeMessage(files: readonly StagedFile[], draft: string): string {
  if (files.length === 0) return draft
  const blocks = files.map(file => file.block).join('\n\n')
  const typed = draft.trim()
  return typed === '' ? `${blocks}\n` : `${blocks}\n\n${typed}`
}
