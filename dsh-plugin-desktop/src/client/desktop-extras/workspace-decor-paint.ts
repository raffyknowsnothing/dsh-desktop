/**
 * Writing sidebar decoration into the rendered DOM: folder colours onto
 * Workspace rows, and divider elements between them.
 *
 * The counterpart to sidebar-workspace-rows.ts, which does the reading. Both
 * halves stay imperative and idempotent: React owns the sidebar, this code
 * only decorates what React has already put on screen, so every pass must be
 * safe to repeat against a tree that may have been re-rendered underneath it.
 *
 * Everything written here is marked with a `data-dsh-` attribute. That marking
 * is what makes removal exact — the cleanup path never has to guess which
 * nodes were ours, so unloading the plugin leaves upstream's DOM as it found
 * it.
 */
import {
  dividersAbove, dividersAtTail, swatchValue,
  type DividerRecord, type WorkspaceDecorState,
} from './workspace-decor-store.ts'
import { glyphSpans, type IdentifiedWorkspaceRow } from './sidebar-workspace-rows.ts'

/**
 * Marks a coloured Workspace row; the value is the palette id.
 *
 * A marker for cleanup, not a styling seam. The colour itself is written
 * inline onto the glyph elements, because the rule that would have carried it
 * could only have selected them through a hashed CSS-module class.
 */
export const FOLDER_ATTRIBUTE = 'data-dsh-folder'

/** Marks a divider element; the value is the divider id. */
export const DIVIDER_ATTRIBUTE = 'data-dsh-divider-id'

/** Class on a divider element. */
export const DIVIDER_CLASS = 'dshWsDivider'

/** Class on the divider's label text. */
export const DIVIDER_LABEL_CLASS = 'dshWsDividerLabel'

/**
 * Apply folder colours to the identified rows.
 *
 * Rows with no stored colour are actively cleared rather than skipped: a
 * colour the user has just removed has to come off the element that still
 * carries it from the previous pass.
 * @param rows - rows matched to their Workspaces.
 * @param state - current decoration state.
 */
export function paintFolderColors(
  rows: readonly IdentifiedWorkspaceRow[],
  state: WorkspaceDecorState,
): void {
  for (const { row, workspaceId } of rows) {
    const paletteId = state.colors[workspaceId]
    const value = swatchValue(paletteId)
    // Both glyphs, not just the folder: upstream swaps the folder for a
    // chevron on row hover, and coluring only one would make the colour blink
    // away under the pointer.
    const glyphs = glyphSpans(row)
    if (paletteId === undefined || value === undefined) {
      row.removeAttribute(FOLDER_ATTRIBUTE)
      for (const glyph of glyphs) glyph.style.removeProperty('color')
      continue
    }
    row.setAttribute(FOLDER_ATTRIBUTE, paletteId)
    // Inline, and therefore winning over upstream's own `color` on these
    // elements without an `!important` and without naming a class.
    for (const glyph of glyphs) glyph.style.setProperty('color', value)
  }
}

/**
 * Reconcile divider elements against the stored list.
 *
 * Reconciling rather than rebuilding: the sidebar re-renders on every Session
 * change, and tearing every divider down each time would flash them. Elements
 * already in the right place are left untouched, and only the label is
 * refreshed.
 * @param region - the sidebar Workspace region.
 * @param rows - rows matched to their Workspaces.
 * @param state - current decoration state.
 */
export function paintDividers(
  region: HTMLElement,
  rows: readonly IdentifiedWorkspaceRow[],
  state: WorkspaceDecorState,
): void {
  const wanted = new Map<string, { divider: DividerRecord; section: HTMLElement | null }>()
  for (const { section, workspaceId } of rows) {
    for (const divider of dividersAbove(state, workspaceId)) {
      wanted.set(divider.id, { divider, section })
    }
  }
  // Dividers parked at the tail: they head a section whose Workspaces are all
  // gone, and they render after the last row rather than above any of it. A
  // null section means "append", which is what places them.
  if (rows.length > 0) {
    for (const divider of dividersAtTail(state)) wanted.set(divider.id, { divider, section: null })
  }

  // Drop dividers whose Workspace has gone, or which the user removed. Rows
  // that are not currently rendered (flat mode, an active search) take their
  // dividers with them and get them back when the tree returns.
  for (const element of existingDividers(region)) {
    const id = element.getAttribute(DIVIDER_ATTRIBUTE)
    if (id === null || !wanted.has(id)) element.remove()
  }

  for (const [id, { divider, section }] of wanted) {
    if (section === null) continue
    const element = findDivider(region, id) ?? createDivider(id)
    setDividerLabel(element, divider.label)
    // Idempotence: only touch the tree when the element is not already sitting
    // directly above its section. Re-inserting an in-place node would move
    // focus and restart the CSS transition on every pass.
    if (element.nextElementSibling !== section || element.parentElement !== section.parentElement) {
      section.parentElement?.insertBefore(element, section)
    }
  }

  // Tail dividers are placed as a chain, each one directly after the last, so
  // a settled list provokes no mutation at all.
  //
  // Appending them individually instead is not merely untidy, it does not
  // terminate: every append makes the previously-appended divider no longer
  // last, so the next pass moves that one, which unseats the other, and the
  // MutationObserver driving these passes never stops firing. Two parked
  // dividers were enough to peg the main thread and freeze the window.
  const list = rows.at(-1)?.section.parentElement ?? null
  if (list === null) return
  let anchor: Element | null = rows.at(-1)?.section ?? null
  for (const divider of dividersAtTail(state)) {
    if (!wanted.has(divider.id)) continue
    const element = findDivider(region, divider.id) ?? createDivider(divider.id)
    setDividerLabel(element, divider.label)
    const desiredNext = anchor === null ? list.firstElementChild : anchor.nextElementSibling
    if (element !== desiredNext) list.insertBefore(element, desiredNext)
    anchor = element
  }
}

/** Every divider element this plugin has placed in the region. */
export function existingDividers(region: HTMLElement): HTMLElement[] {
  return [...region.querySelectorAll<HTMLElement>(`[${DIVIDER_ATTRIBUTE}]`)]
}

/**
 * One placed divider element by id.
 *
 * Ids are minted from base-36 digits only, so the selector is safe without
 * escaping; `CSS.escape` is still preferred where it exists, and its absence
 * must not throw on a runtime that lacks it.
 */
function findDivider(region: HTMLElement, id: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(id)
    : id.replace(/[^a-zA-Z0-9_-]/g, '')
  return region.querySelector<HTMLElement>(`[${DIVIDER_ATTRIBUTE}="${escaped}"]`)
}

/**
 * Build one divider element.
 *
 * `role="separator"` rather than a bare div: the element is a real structural
 * break inside a `role="tree"`, and separator is the honest name for it.
 * Nothing inside is focusable, so the tree's own keyboard model is untouched —
 * the rename and remove actions arrive through the context menu instead.
 */
function createDivider(id: string): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute(DIVIDER_ATTRIBUTE, id)
  element.className = DIVIDER_CLASS
  element.setAttribute('role', 'separator')
  element.setAttribute('aria-orientation', 'horizontal')
  const label = document.createElement('span')
  label.className = DIVIDER_LABEL_CLASS
  element.appendChild(label)
  return element
}

/** Write the label, and mark the unlabelled case so CSS can render a bare rule. */
function setDividerLabel(element: HTMLElement, label: string): void {
  const trimmed = label.trim()
  const span = element.querySelector<HTMLElement>(`.${DIVIDER_LABEL_CLASS}`)
  if (span !== null && span.textContent !== trimmed) span.textContent = trimmed
  element.setAttribute('data-dsh-divider-empty', trimmed === '' ? 'true' : 'false')
  if (trimmed === '') element.removeAttribute('aria-label')
  else element.setAttribute('aria-label', trimmed)
}

/**
 * Remove every trace of this feature from the region.
 *
 * Called when the plugin generation unloads. Upstream owns these elements'
 * neighbours, so leaving a stale divider behind would outlive the code that
 * knows how to manage it.
 * @param region - the sidebar Workspace region, or null when unmounted.
 */
export function clearDecor(region: HTMLElement | null): void {
  if (region === null) return
  for (const element of existingDividers(region)) element.remove()
  for (const row of region.querySelectorAll<HTMLElement>(`[${FOLDER_ATTRIBUTE}]`)) {
    row.removeAttribute(FOLDER_ATTRIBUTE)
    for (const glyph of glyphSpans(row)) glyph.style.removeProperty('color')
  }
}
