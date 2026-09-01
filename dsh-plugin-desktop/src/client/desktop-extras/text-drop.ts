/**
 * Dropping and pasting text files into the composer.
 *
 * Upstream's composer accepts images only: `ComposerAttachments` listens for
 * document drops, and anything that is not an image gets the refusal overlay.
 * That listener is on the bubble phase, so this feature claims text-file drops
 * ahead of it in the capture phase and stops them there. Everything else —
 * images, mixed drops, dragged text selections, plain-text pastes — reaches
 * upstream untouched.
 *
 * A drag cannot be inspected. Chromium withholds `dataTransfer.items` until
 * the drop and never exposes filenames during a drag, so nothing here can tell
 * a Markdown file from a PNG until it lands. Every file drag is therefore kept
 * droppable, and the decision is made at the drop where the names are finally
 * readable. Refusing the drag instead lets upstream set `dropEffect = 'none'`,
 * after which Chromium fires no drop event at all and the file is unreachable.
 *
 * Claiming an event upstream also handles means owning what its handler would
 * have done. `ComposerAttachments` runs a depth-counted drop overlay across
 * dragenter/dragleave and closes it from its own drop handler, so a drop
 * stopped here would strand that overlay on screen. The drop therefore raises
 * a `dragend`, which is upstream's own reset path. That is not decoration:
 * without it the overlay sticks.
 *
 * Insertion goes through a synthetic `paste` event rather than any editor API.
 * The composer binds a Lexical editor registered with `@lexical/plain-text`,
 * which owns PASTE_COMMAND, so a dispatched paste lands the text at the caret
 * inside Lexical's own history and undo stack. Writing to the DOM directly, or
 * reaching for the input facade, would either be reverted on the next
 * reconcile or need session-scope plumbing this root-scoped feature does not
 * have.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import {
  capContent, fenceFile, joinBlocks, ownsDrop, dragCarriesFiles,
} from './text-drop-model.ts'
import {
  hasStagingHost, mintStagedId, resetStaging, stageFiles, type StagedFile,
} from './text-drop-store.ts'

/** The composer's contenteditable host, marked by upstream's editor binding. */
export const COMPOSER_SELECTOR = '[data-composer-input]'

/** Files carried by a drag or drop, if any. */
function filesOf(transfer: DataTransfer | null): File[] {
  if (transfer === null) return []
  return [...transfer.files]
}

/**
 * The composer's editable host, when one is mounted and writable.
 *
 * A composer rendered inert (no Session selected, or a read-only state) has
 * `contenteditable="false"`, and pasting into it would be dropped silently.
 * @returns the element, or null when there is nothing to write into.
 */
export function composerElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const element = document.querySelector<HTMLElement>(COMPOSER_SELECTOR)
  if (element === null) return null
  return element.getAttribute('contenteditable') === 'true' ? element : null
}

/**
 * Put the caret inside the composer, at the end when it is not already there.
 *
 * Lexical inserts at the current selection, so a paste dispatched while the
 * focus sits elsewhere — which is exactly the case after a drag — would have
 * no anchor to insert at.
 */
function focusComposer(element: HTMLElement): void {
  element.focus()
  const selection = window.getSelection()
  if (selection === null) return
  const inside = selection.rangeCount > 0
    && selection.anchorNode !== null
    && element.contains(selection.anchorNode)
  if (inside) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Insert text into the composer as if it had been pasted.
 * @param text - the text to insert.
 * @returns whether a composer was found to insert into.
 */
export function insertIntoComposer(text: string): boolean {
  const element = composerElement()
  if (element === null || text === '') return false
  focusComposer(element)
  const data = new DataTransfer()
  data.setData('text/plain', text)
  element.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: data,
    bubbles: true,
    cancelable: true,
  }))
  return true
}

/**
 * Read every file and insert them as one fenced block per file.
 * @param files - the qualifying text files, in drop order.
 */
async function inlineFiles(files: readonly File[]): Promise<void> {
  const blocks: string[] = []
  const staged: StagedFile[] = []
  for (const file of files) {
    let text: string
    try {
      text = await file.text()
    } catch {
      // An unreadable file is skipped rather than failing the whole drop; the
      // others still land, and the user can see which one is missing.
      continue
    }
    const { content, truncated } = capContent(text)
    const block = fenceFile(file.name, content, truncated)
    blocks.push(block)
    staged.push({
      id: mintStagedId(),
      name: file.name,
      block,
      chars: content.length,
      truncated,
    })
  }
  if (staged.length === 0) return
  // With a rail mounted the files become tiles and their text joins the
  // message on send. Without one — no current Session, so nothing is rendering
  // the dock — staging would hide the files behind an invisible rail, so the
  // older behaviour stands in and pastes the text where the user can see it.
  if (hasStagingHost()) {
    stageFiles(staged)
    return
  }
  const insertion = joinBlocks(blocks)
  if (insertion !== '') insertIntoComposer(insertion)
}

/**
 * Claim text-file drops and pastes for the composer.
 *
 * All three listeners are capture-phase and all three are conditional: an
 * event this feature does not own is left entirely alone, so upstream's own
 * handling runs exactly as it would without this module loaded.
 * @returns the uninstall function.
 */
export function installTextDrop(): () => void {
  if (typeof document === 'undefined') return () => {}
  // A reload must not inherit files, or a host count, from the generation
  // before it; the tiles that displayed them are already gone.
  resetStaging()

  // Keep every file drag droppable, so the drop handler below gets the chance
  // to read the filenames and decide.
  //
  // Only dragover is claimed, and dragenter deliberately is not: upstream's
  // overlay is depth-counted across dragenter and dragleave, and stealing
  // those would leave its counter wrong for image drags too. Letting its
  // overlay run its own course costs only a misleading caption during a text
  // drag, which is a far smaller price than breaking image drops.
  //
  // The composer only has to exist, not to be editable. Requiring editable
  // here is what silently disabled this for a composer in its inert state.
  const claimDrag = (event: DragEvent): void => {
    if (document.querySelector(COMPOSER_SELECTOR) === null) return
    if (!dragCarriesFiles(event.dataTransfer)) return
    // Without this, upstream's own dragover sets dropEffect to 'none' whenever
    // it cannot take the file, and Chromium then fires no drop event at all.
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = (event: DragEvent): void => {
    if (document.querySelector(COMPOSER_SELECTOR) === null) return
    const files = filesOf(event.dataTransfer)
    if (!ownsDrop(files)) return
    event.preventDefault()
    event.stopPropagation()
    // Upstream closes its overlay from its own drop handler, which this has
    // just stopped. When the drag was not claimable by MIME type its overlay
    // is open right now and nothing else will close it: dragend does not fire
    // for a drag that began outside the document, and no dragleave follows a
    // drop. Its window-level dragend listener is a bare reset, so raising one
    // closes the overlay through upstream's own path.
    window.dispatchEvent(new Event('dragend'))
    void inlineFiles(files)
  }

  // Pasting a file copied in Finder or Explorer arrives as files on the
  // clipboard, with no text/plain alongside it, so upstream's plain-text paste
  // path never sees anything to insert.
  const onPaste = (event: ClipboardEvent): void => {
    const target = event.target
    if (!(target instanceof Node)) return
    const element = composerElement()
    if (element === null || !element.contains(target)) return
    const files = [...(event.clipboardData?.files ?? [])]
    if (!ownsDrop(files)) return
    event.preventDefault()
    event.stopPropagation()
    void inlineFiles(files)
  }

  document.addEventListener('dragover', claimDrag, true)
  document.addEventListener('drop', onDrop, true)
  document.addEventListener('paste', onPaste, true)
  return () => {
    document.removeEventListener('dragover', claimDrag, true)
    document.removeEventListener('drop', onDrop, true)
    document.removeEventListener('paste', onPaste, true)
  }
}

/**
 * Install the text-file drop handler for one Cordis generation.
 * @param ctx - browser Cordis context.
 */
export function applyTextDrop(ctx: ClientContext): void {
  ctx.effect(
    () => installTextDrop(),
    'dsh-plugin-desktop: text-file drop into the composer',
  )
}
