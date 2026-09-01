/**
 * Writing the archived-session group into the sidebar tree.
 *
 * The counterpart to archive-model.ts. Upstream hides archived Sessions from
 * every grouping surface and renders no archive UI, so the Desktop side draws
 * its own read-only group inside the same `role="tree"` that holds the
 * Workspace sections: a header naming the group, one button per archived
 * Session, nothing else. Clicking a row reopens the Session; clicking the
 * header folds or unfolds the rows.
 *
 * The same rules as the divider painter apply. Every element is marked with a
 * `data-dsh-` attribute so removal is exact. Every pass is idempotent against
 * a tree React has re-rendered underneath, because this code runs from the
 * same MutationObserver that watches the subtree it writes into — a placement
 * that is not perfectly stable becomes an unbounded repaint loop.
 *
 * The group sits before the Ungrouped bucket when one renders, and at the end
 * of the tree otherwise. It is never a treeitem: the tree's own keyboard model
 * only expects upstream's rows, and the header and rows are plain buttons.
 */
import type { ArchiveRow } from './archive-model.ts'

/** Marks the archived group section; presence means "ours". */
export const ARCHIVE_SECTION_ATTRIBUTE = 'data-dsh-archive-section'

/** Marks one archived Session row; the value is the Session id. */
export const ARCHIVE_ROW_ATTRIBUTE = 'data-dsh-archive-session'

/** Class on the group section. */
export const ARCHIVE_SECTION_CLASS = 'dshWsArchive'

/** Class on the header row that folds and unfolds the group. */
export const ARCHIVE_HEADER_CLASS = 'dshWsArchiveHeader'

/** Class on one archived Session row. */
export const ARCHIVE_ROW_CLASS = 'dshWsArchiveRow'

/** Class on the row label. */
export const ARCHIVE_ROW_LABEL_CLASS = 'dshWsArchiveRowLabel'

/**
 * Reconcile the archived group against the stored archive list.
 *
 * Reconciling rather than rebuilding: the sidebar re-renders on every Session
 * change, and tearing the group down each time would flash it. A settled tree
 * must provoke zero mutations, which is what the paint spec asserts.
 * @param tree - the sidebar row list (`[role="tree"]`).
 * @param anchorBefore - the Ungrouped section to sit before, or null to append at the end.
 * @param rows - archived rows in archive order; empty removes the group.
 * @param headerLabel - the rendered header text, already localized.
 * @param expanded - whether the Session rows are visible.
 */
export function paintArchiveSection(
  tree: HTMLElement,
  anchorBefore: HTMLElement | null,
  rows: readonly ArchiveRow[],
  headerLabel: string,
  expanded: boolean,
): void {
  const section = findArchiveSection(tree)
  if (rows.length === 0) {
    if (section !== null) section.remove()
    return
  }
  const settled = section ?? createArchiveSection(headerLabel, expanded)
  // Idempotence: only touch the tree when the section is not already sitting
  // where it belongs. The parent check covers a fresh section, which has no
  // sibling yet; without it a new group would never be placed at all.
  // Re-inserting an in-place node would restart the CSS transition and feed
  // the observer on every pass.
  if (settled.parentElement !== tree || settled.nextElementSibling !== anchorBefore) {
    tree.insertBefore(settled, anchorBefore)
  }
  setHeaderLabel(settled, headerLabel)
  setHeaderExpanded(settled, expanded)

  // Remove rows the user has archived away, or that a fold has hidden.
  const wanted = new Set(expanded ? rows.map(row => row.id) : [])
  for (const element of settled.querySelectorAll<HTMLElement>(`[${ARCHIVE_ROW_ATTRIBUTE}]`)) {
    const id = element.getAttribute(ARCHIVE_ROW_ATTRIBUTE)
    if (id === null || !wanted.has(id)) element.remove()
  }
  if (!expanded) return

  // Place the wanted rows in archive order, each directly before the next.
  // Walking backward and inserting before the previously placed row means a
  // settled list provokes no mutation at all; appending in forward order
  // would re-insert every row that was already in place. The parent check is
  // the same fresh-node guard the section placement uses.
  let next: HTMLElement | null = null
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    if (row === undefined) continue
    const element = findArchiveRow(settled, row.id) ?? createArchiveRow(row)
    if (element.parentElement !== settled || element.nextElementSibling !== next) {
      settled.insertBefore(element, next)
    }
    setRowLabel(element, row.label)
    next = element
  }
}

/**
 * Remove every trace of the archived group from the region.
 *
 * Called when the plugin generation unloads, alongside the divider cleanup.
 * @param region - the sidebar Workspace region, or null when unmounted.
 */
export function clearArchiveSection(region: HTMLElement | null): void {
  if (region === null) return
  for (const element of region.querySelectorAll<HTMLElement>(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)) {
    element.remove()
  }
}

/** The archived group already in the tree, if any. */
function findArchiveSection(tree: HTMLElement): HTMLElement | null {
  return tree.querySelector<HTMLElement>(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
}

/**
 * One archived Session row by id.
 *
 * Ids are session UUIDs, so the selector is escaped the same way the divider
 * painter escapes its ids; `CSS.escape` where it exists, a conservative
 * character filter elsewhere.
 */
function findArchiveRow(section: HTMLElement, id: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(id)
    : id.replace(/[^a-zA-Z0-9_-]/g, '')
  return section.querySelector<HTMLElement>(`[${ARCHIVE_ROW_ATTRIBUTE}="${escaped}"]`)
}

/**
 * Build a fresh archived group.
 *
 * `role="group"` with a labelled header: a plain structural container inside
 * the tree, never a treeitem, so upstream's keyboard model never meets an
 * element it does not own. The header is a button, which is what makes the
 * group foldable without any extra key handling.
 */
function createArchiveSection(headerLabel: string, expanded: boolean): HTMLElement {
  const section = document.createElement('div')
  section.setAttribute(ARCHIVE_SECTION_ATTRIBUTE, '')
  section.className = ARCHIVE_SECTION_CLASS
  section.setAttribute('role', 'group')
  const header = document.createElement('button')
  header.type = 'button'
  header.className = ARCHIVE_HEADER_CLASS
  section.appendChild(header)
  setHeaderLabel(section, headerLabel)
  setHeaderExpanded(section, expanded)
  return section
}

/** Write the header text, and mark the fold state the CSS chevron reads. */
function setHeaderLabel(section: HTMLElement, label: string): void {
  const header = section.querySelector<HTMLElement>(`.${ARCHIVE_HEADER_CLASS}`)
  if (header !== null && header.textContent !== label) header.textContent = label
  section.setAttribute('aria-label', label)
}

/** Reflect the fold state on the header button (aria) and the CSS chevron. */
function setHeaderExpanded(section: HTMLElement, expanded: boolean): void {
  const header = section.querySelector<HTMLElement>(`.${ARCHIVE_HEADER_CLASS}`)
  if (header !== null) header.setAttribute('aria-expanded', expanded ? 'true' : 'false')
}

/** Build one archived Session row button, labelled with the display title. */
function createArchiveRow(row: ArchiveRow): HTMLElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.setAttribute(ARCHIVE_ROW_ATTRIBUTE, row.id)
  element.className = ARCHIVE_ROW_CLASS
  const label = document.createElement('span')
  label.className = ARCHIVE_ROW_LABEL_CLASS
  element.appendChild(label)
  setRowLabel(element, row.label)
  return element
}

/**
 * Write the row label, only when it changed.
 *
 * The guard matters for the same reason the header guard does: an unchanged
 * write would still replace the text node and feed the observer.
 */
function setRowLabel(element: HTMLElement, label: string): void {
  const span = element.querySelector<HTMLElement>(`.${ARCHIVE_ROW_LABEL_CLASS}`)
  if (span !== null && span.textContent !== label) span.textContent = label
}
