/**
 * Reading the sidebar's Workspace rows out of the DOM.
 *
 * The Workspace browser is upstream's (`ui-workspace`), it fills the sidebar's
 * `sidebar.workspaces` hole as a single occupant, and it declares no seam for
 * per-row decoration. Replacing the whole occupant to colour an icon would
 * mean re-implementing its entire injected surface, so the Desktop side reads
 * the rendered rows instead, the same way find-in-chat reads the transcript.
 *
 * Everything here anchors on ARIA roles, never on class names. The first cut
 * of this file used `.projectRow` and `.groupSection`, on the evidence that
 * the submodule's built bundle carries those names unhashed. That evidence was
 * from a stale artifact: the packaged client hashes every CSS-module class,
 * per module, with a build-specific prefix. The same row ships as
 * `_94NKXq_projectRow` in one build and something else in the next, so no
 * class name here would have survived even if it had ever matched.
 *
 * Three upstream anchors hold this up, and all three are contracts rather than
 * artifacts of a build:
 *
 * - `[data-slot="sidebar.workspaces"]` wraps the region. This is the
 *   renderer's documented anchor contract (`ui-renderer`, scoped-slots.tsx).
 * - `role="tree"` on the list, and `role="treeitem"` on every row. Upstream
 *   renders the browser as a real ARIA tree.
 * - `aria-expanded` separates the two kinds of row. Workspace headers carry
 *   it because they fold; Session rows do not, because they do not. That is
 *   what makes the distinction semantic rather than cosmetic.
 *
 * Every function degrades to "no rows" rather than throwing. In flat and
 * search modes upstream renders no Workspace headers at all, so the scan finds
 * nothing and the decoration does not apply, which is correct for those modes.
 */

/** The renderer's anchor for the sidebar Workspace region. */
export const SIDEBAR_REGION_SELECTOR = '[data-slot="sidebar.workspaces"]'

/** The row list. Search and flat modes render their own; each is a tree. */
export const TREE_SELECTOR = '[role="tree"]'

/**
 * A Workspace header row. `aria-expanded` is the discriminator: upstream sets
 * it on Workspace headers, which fold, and never on Session rows, which do
 * not.
 */
export const WORKSPACE_ROW_SELECTOR = '[role="treeitem"][aria-expanded]'

/** Guard on the walk from a row up to its section; the real depth is 2. */
const MAX_SECTION_LIFT = 6

/** One Workspace header row located in the rendered sidebar. */
export interface SidebarWorkspaceRow {
  /** The section element, a direct child of the tree; dividers go before it. */
  readonly section: HTMLElement
  /** The header row element, which owns the folder glyph and the title. */
  readonly row: HTMLElement
  /** Title text as rendered, for menu copy and diagnostics. */
  readonly label: string
}

/** One row matched to the Workspace it renders. */
export interface IdentifiedWorkspaceRow extends SidebarWorkspaceRow {
  /** The backing Workspace id. */
  readonly workspaceId: string
}

/**
 * Locate the sidebar Workspace region.
 * @param root - document to search, defaulting to the ambient one.
 * @returns the region element, or null when the sidebar is not mounted.
 */
export function sidebarRegion(root: Document | HTMLElement | undefined): HTMLElement | null {
  if (root === undefined) return null
  return root.querySelector<HTMLElement>(SIDEBAR_REGION_SELECTOR)
}

/**
 * The row list inside the region.
 *
 * Grouped, flat, and search views each render their own `role="tree"`, and
 * only one exists at a time.
 * @param region - the sidebar Workspace region.
 * @returns the tree element, or null when the region is not mounted.
 */
export function sidebarTree(region: HTMLElement | null): HTMLElement | null {
  if (region === null) return null
  return region.querySelector<HTMLElement>(TREE_SELECTOR)
}

/**
 * The section a row belongs to: the ancestor that is a direct child of the
 * tree.
 *
 * Walking up rather than matching a class, because the depth is not fixed. A
 * Workspace row is wrapped in a hover card and sits two levels down; the
 * Ungrouped bucket has no hover card and sits one level down. The tree itself
 * is the only reliable stopping point.
 * @param row - the header row.
 * @param tree - the row list.
 * @returns the section element, or null if the row is not under this tree.
 */
export function sectionOf(row: HTMLElement, tree: HTMLElement): HTMLElement | null {
  let node: HTMLElement = row
  for (let lift = 0; lift < MAX_SECTION_LIFT; lift += 1) {
    const parent = node.parentElement
    if (parent === null) return null
    if (parent === tree) return node
    node = parent
  }
  return null
}

/**
 * The row's title text.
 *
 * The leading children are icon holders (folder, then the chevron that
 * replaces it on hover); the title is the first child carrying text. Reading
 * the row's whole textContent instead would fold in the hover-revealed action
 * buttons' accessible text.
 * @param row - the header row.
 * @returns the trimmed title, or '' when no text child is present.
 */
export function rowLabel(row: HTMLElement): string {
  for (const child of row.children) {
    const text = (child.textContent ?? '').trim()
    if (text !== '') return text
  }
  return ''
}

/**
 * The leading glyph holders on a row: the folder, and the chevron that
 * replaces it on hover.
 *
 * Both are icon-only children at the head of the row, so the scan takes
 * children while they hold graphics and no text, and stops at the title. That
 * keeps the trailing action buttons out, which also hold graphics.
 * @param row - the header row.
 * @returns the glyph holders, in order.
 */
export function glyphSpans(row: HTMLElement): HTMLElement[] {
  const glyphs: HTMLElement[] = []
  for (const child of row.children) {
    if (!(child instanceof HTMLElement)) break
    if ((child.textContent ?? '').trim() !== '') break
    if (child.querySelector('svg') === null) break
    glyphs.push(child)
  }
  return glyphs
}

/**
 * Read every Workspace header row in the region, in document order.
 * @param region - the sidebar Workspace region.
 * @returns the rows, in render order.
 */
export function readWorkspaceRows(region: HTMLElement | null): SidebarWorkspaceRow[] {
  const tree = sidebarTree(region)
  if (tree === null) return []
  const rows: SidebarWorkspaceRow[] = []
  for (const row of tree.querySelectorAll<HTMLElement>(WORKSPACE_ROW_SELECTOR)) {
    const section = sectionOf(row, tree)
    if (section === null) continue
    rows.push({ section, row, label: rowLabel(row) })
  }
  return rows
}

/**
 * Pair rendered rows with Workspace ids by position.
 *
 * Upstream renders one section per Workspace, in list order, then appends the
 * Ungrouped bucket. So the first `workspaceIds.length` rows are the real
 * Workspaces and anything past that is the bucket, which owns no Workspace and
 * is therefore left undecorated.
 *
 * Pairing by position rather than by title is deliberate: titles are neither
 * unique nor stable, and a rename must not move a colour to a different row.
 * When the two lists disagree in length by more than the optional bucket the
 * render is mid-flight, so nothing is paired at all — a half-applied mapping
 * would paint colours onto the wrong Workspaces.
 * @param rows - rows in render order.
 * @param workspaceIds - Workspace ids in list order.
 * @returns the identified rows; empty when the two views disagree.
 */
export function identifyWorkspaceRows(
  rows: readonly SidebarWorkspaceRow[],
  workspaceIds: readonly string[],
): IdentifiedWorkspaceRow[] {
  // The bucket is the only legitimate extra row. Anything else means the DOM
  // and the snapshot are describing different moments.
  const extra = rows.length - workspaceIds.length
  if (extra !== 0 && extra !== 1) return []
  const identified: IdentifiedWorkspaceRow[] = []
  for (const [index, workspaceId] of workspaceIds.entries()) {
    const row = rows[index]
    if (row === undefined) continue
    identified.push({ ...row, workspaceId })
  }
  return identified
}

/**
 * The Ungrouped bucket section, when it renders.
 *
 * Upstream appends the bucket after the Workspace sections whenever loose
 * Sessions exist, so it is the one legitimate extra row. The archived group
 * sits directly above it; with no bucket it appends at the end of the tree
 * instead.
 * @param rows - rows in render order.
 * @param workspaceIds - Workspace ids in list order.
 * @returns the bucket's section, or null when there is no extra row.
 */
export function ungroupedSection(
  rows: readonly SidebarWorkspaceRow[],
  workspaceIds: readonly string[],
): HTMLElement | null {
  if (rows.length !== workspaceIds.length + 1) return null
  return rows[workspaceIds.length]?.section ?? null
}
