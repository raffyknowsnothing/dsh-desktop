/**
 * Desktop-owned sidebar decoration state: a colour per Workspace folder icon,
 * and the named divider rows that sit between Workspaces.
 *
 * Pure and DOM-free on purpose. Everything here is a value transform over one
 * plain state object plus a narrow storage port, so the whole model is unit
 * testable without a renderer, and the painting layer stays free of decisions.
 *
 * Colours key on the Workspace id rather than its title: a rename must not
 * lose the colour, and two Workspaces may legitimately share a title. Dividers
 * pin above a Workspace id for the same reason — the sidebar's drag reordering
 * moves Workspaces around, and a divider pinned to a position rather than to a
 * neighbour would drift on every reorder.
 */

/** Storage port; `localStorage` satisfies it, and tests pass a plain map. */
export interface DecorStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Persistence key. Bump the suffix if the stored shape ever changes. */
export const DECOR_STORAGE_KEY = 'dsh.desktop.workspace-decor.v1'

/**
 * Anchor meaning "after the last Workspace" rather than above a particular
 * one.
 *
 * A divider anchored to the bottom Workspace has nowhere to move when that
 * Workspace is deleted, and the first version of this deleted it. That is the
 * one outcome a user cannot undo, and it is exactly what a heading over an
 * empty section looks like on its way to being refilled. So it moves here
 * instead, and no deletion ever destroys a divider.
 *
 * Not the empty string, which upstream already uses for its Ungrouped bucket.
 */
export const TAIL_ANCHOR = '::tail'

/**
 * One named divider, pinned above a Workspace row.
 *
 * `above` is a Workspace id and not an index: the sidebar reorders Workspaces
 * by drag, and an index would silently point at a different neighbour after
 * every move.
 */
export interface DividerRecord {
  /** Stable local identity, minted at creation. */
  readonly id: string
  /** User-facing label; an empty string renders as a bare rule. */
  readonly label: string
  /** Workspace id this divider sits above. */
  readonly above: string
}

/** The whole persisted decoration state. */
export interface WorkspaceDecorState {
  /** Palette id per Workspace id. A missing entry means the default folder colour. */
  readonly colors: Readonly<Record<string, string>>
  /** Dividers in no particular order; placement comes from `above`. */
  readonly dividers: readonly DividerRecord[]
  /**
   * Workspace order as last seen, kept only so a divider can survive the
   * deletion of the Workspace it was pinned above.
   *
   * A divider is a section heading. Deleting the first Workspace under it must
   * not take the heading with it, because the section below is still there. To
   * re-pin the divider to whatever now comes first, the reconciliation has to
   * know what used to follow the deleted row, and the live list no longer
   * says. This is that memory, and it is persisted so a deletion made while
   * the app was closed is still recoverable.
   */
  readonly order?: readonly string[]
}

/** Nothing decorated. */
export const EMPTY_DECOR: WorkspaceDecorState = { colors: {}, dividers: [] }

/** One selectable folder colour. */
export interface DecorSwatch {
  /** Stored palette id. */
  readonly id: string
  /** CSS colour applied to the folder glyph. */
  readonly value: string
}

/**
 * The folder palette. Hand-picked to stay legible against both the light and
 * the dark surface without a per-theme table: each sits in the mid lightness
 * band where neither background swamps it.
 */
export const DECOR_PALETTE: readonly DecorSwatch[] = [
  { id: 'red', value: '#e5484d' },
  { id: 'orange', value: '#f76b15' },
  { id: 'amber', value: '#ffb224' },
  { id: 'green', value: '#30a46c' },
  { id: 'teal', value: '#12a594' },
  { id: 'blue', value: '#3e63dd' },
  { id: 'purple', value: '#8e4ec6' },
  { id: 'pink', value: '#e93d82' },
]

/** Resolve a stored palette id to its CSS colour; unknown ids fall back to the default. */
export function swatchValue(id: string | undefined): string | undefined {
  if (id === undefined) return undefined
  return DECOR_PALETTE.find(swatch => swatch.id === id)?.value
}

/**
 * Read decoration state from storage.
 *
 * Any malformed or partially-shaped payload resolves to {@link EMPTY_DECOR}
 * rather than throwing: this runs during a sidebar paint, and a corrupt value
 * written by a future version must degrade to an undecorated sidebar, never to
 * a broken one.
 * @param storage - the backing store.
 * @returns the parsed state, or the empty state.
 */
export function readDecor(storage: DecorStorage): WorkspaceDecorState {
  let raw: string | null = null
  try {
    raw = storage.getItem(DECOR_STORAGE_KEY)
  } catch {
    return EMPTY_DECOR
  }
  if (raw === null) return EMPTY_DECOR
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_DECOR
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_DECOR
  const source = parsed as { colors?: unknown; dividers?: unknown; order?: unknown }
  const order = Array.isArray(source.order)
    ? (source.order as readonly unknown[]).filter((id): id is string => typeof id === 'string')
    : undefined
  return {
    colors: parseColors(source.colors),
    dividers: parseDividers(source.dividers),
    ...order === undefined ? {} : { order },
  }
}

/** Keep only string-to-string colour entries. */
function parseColors(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {}
  const colors: Record<string, string> = {}
  for (const [workspaceId, id] of Object.entries(value as Record<string, unknown>)) {
    if (typeof id === 'string' && id !== '') colors[workspaceId] = id
  }
  return colors
}

/** Keep only fully-formed divider records. */
function parseDividers(value: unknown): DividerRecord[] {
  if (!Array.isArray(value)) return []
  const dividers: DividerRecord[] = []
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { id?: unknown; label?: unknown; above?: unknown }
    if (typeof record.id !== 'string' || record.id === '') continue
    if (typeof record.above !== 'string' || record.above === '') continue
    dividers.push({
      id: record.id,
      label: typeof record.label === 'string' ? record.label : '',
      above: record.above,
    })
  }
  return dividers
}

/**
 * Persist decoration state.
 *
 * Write failures are swallowed: a full or blocked quota must not take the
 * sidebar down with it, and the in-memory state stays correct for the session.
 * @param storage - the backing store.
 * @param state - state to write.
 */
export function writeDecor(storage: DecorStorage, state: WorkspaceDecorState): void {
  try {
    storage.setItem(DECOR_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage is best-effort; the session keeps its state either way.
  }
}

/**
 * Set or clear one Workspace's folder colour.
 * @param state - current state.
 * @param workspaceId - target Workspace.
 * @param colorId - palette id, or null to restore the default folder colour.
 * @returns the next state.
 */
export function setWorkspaceColor(
  state: WorkspaceDecorState,
  workspaceId: string,
  colorId: string | null,
): WorkspaceDecorState {
  const colors = { ...state.colors }
  if (colorId === null) delete colors[workspaceId]
  else colors[workspaceId] = colorId
  return { ...state, colors }
}

/**
 * Mint a divider id. Time plus a random suffix: ids only need to be unique
 * within one machine's stored list, so a counter would be worse (it resets
 * with the page and collides across windows).
 * @returns a fresh id.
 */
export function mintDividerId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Add a divider above one Workspace.
 * @param state - current state.
 * @param above - Workspace id the divider sits above.
 * @param label - initial label.
 * @param id - injectable identity, for deterministic tests.
 * @returns the next state.
 */
export function addDivider(
  state: WorkspaceDecorState,
  above: string,
  label: string,
  id: string = mintDividerId(),
): WorkspaceDecorState {
  return { ...state, dividers: [...state.dividers, { id, label, above }] }
}

/**
 * Rename one divider.
 * @param state - current state.
 * @param id - divider to rename.
 * @param label - new label.
 * @returns the next state.
 */
export function renameDivider(
  state: WorkspaceDecorState,
  id: string,
  label: string,
): WorkspaceDecorState {
  return {
    ...state,
    dividers: state.dividers.map(divider => divider.id === id ? { ...divider, label } : divider),
  }
}

/**
 * Remove one divider.
 * @param state - current state.
 * @param id - divider to remove.
 * @returns the next state.
 */
export function removeDivider(state: WorkspaceDecorState, id: string): WorkspaceDecorState {
  return { ...state, dividers: state.dividers.filter(divider => divider.id !== id) }
}

/**
 * Dividers pinned above one Workspace, in stored order.
 * @param state - current state.
 * @param workspaceId - the Workspace row being painted.
 * @returns the dividers to render above that row.
 */
export function dividersAbove(
  state: WorkspaceDecorState,
  workspaceId: string,
): readonly DividerRecord[] {
  return state.dividers.filter(divider => divider.above === workspaceId)
}

/**
 * Dividers parked after the last Workspace row.
 * @param state - current state.
 * @returns the dividers to render at the tail, in stored order.
 */
export function dividersAtTail(state: WorkspaceDecorState): readonly DividerRecord[] {
  return state.dividers.filter(divider => divider.above === TAIL_ANCHOR)
}

/**
 * Drop decoration for Workspaces that no longer exist.
 *
 * Deleting a Workspace in the sidebar leaves its colour and any divider pinned
 * above it stranded; without this they accumulate forever and a re-created
 * Workspace could inherit a stale colour through a recycled id.
 *
 * Only ever called with a settled Workspace list. Pruning against a list that
 * is still loading would delete every decoration the user has.
 * @param state - current state.
 * @param known - every live Workspace id.
 * @returns the pruned state, or the same reference when nothing was stale.
 */
export function reconcileDecor(
  state: WorkspaceDecorState,
  orderedIds: readonly string[],
): WorkspaceDecorState {
  const live = new Set(orderedIds)
  const colorEntries = Object.entries(state.colors).filter(([workspaceId]) => live.has(workspaceId))

  // A divider whose anchor is gone moves down to whatever now heads its
  // section, rather than being deleted with the Workspace. The previous order
  // is the only record of what followed the deleted row.
  const previous = state.order ?? orderedIds
  const dividers: DividerRecord[] = state.dividers.map((divider) => {
    if (divider.above === TAIL_ANCHOR || live.has(divider.above)) return divider
    // No survivor below means the divider headed the bottom of the list. It
    // moves to the tail rather than being deleted: a heading over an empty
    // section is a normal state on the way to refilling it, and losing one is
    // the single outcome the user cannot undo.
    const next = successorOf(divider.above, previous, live) ?? TAIL_ANCHOR
    return { ...divider, above: next }
  })

  const colorsChanged = colorEntries.length !== Object.keys(state.colors).length
  const dividersChanged = dividers.length !== state.dividers.length
    || dividers.some((divider, index) => divider.above !== state.dividers[index]?.above)
  const orderChanged = state.order === undefined
    || state.order.length !== orderedIds.length
    || state.order.some((id, index) => id !== orderedIds[index])
  if (!colorsChanged && !dividersChanged && !orderChanged) return state
  return {
    colors: colorsChanged ? Object.fromEntries(colorEntries) : state.colors,
    dividers: dividersChanged ? dividers : state.dividers,
    order: orderedIds,
  }
}

/**
 * The first still-live Workspace after `missing` in the previous order.
 * @param missing - the deleted anchor.
 * @param previous - workspace order as last seen.
 * @param live - Workspace ids that still exist.
 * @returns the new anchor, or undefined when nothing survives below it.
 */
function successorOf(
  missing: string,
  previous: readonly string[],
  live: ReadonlySet<string>,
): string | undefined {
  const at = previous.indexOf(missing)
  if (at === -1) return undefined
  for (let index = at + 1; index < previous.length; index += 1) {
    const candidate = previous[index]
    if (candidate !== undefined && live.has(candidate)) return candidate
  }
  return undefined
}
