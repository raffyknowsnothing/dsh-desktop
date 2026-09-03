/**
 * Desktop archive list model: which archived Sessions the sidebar's Archived
 * group shows, and in what order.
 *
 * Pure and DOM-free, like the rest of the decoration model. The source of
 * truth is the registry-global archive set on the Workspace snapshot
 * (`archivedSessionIds`, archive order) paired with Session summaries from the
 * Sessions snapshot for display titles. Archived Sessions keep their Workspace
 * slot, so this list is the only place they are visible at all — upstream
 * hides the whole set from every grouping surface.
 */

/** One row of the archived list. */
export interface ArchiveRow {
  /** The Session id, used to reopen it. */
  readonly id: string
  /** Human-facing label: durable title, project basename, then session id. */
  readonly label: string
}

/** The slice of a Session summary this model reads. */
export interface ArchiveSessionLike {
  /** Human-facing label: durable title, project basename, then session id. */
  readonly displayTitle: string
}

/**
 * The archived rows in archive order.
 *
 * Summaries the Sessions snapshot has not pulled yet are skipped: a row with
 * no label would render nothing useful, and the next paint pass adds it the
 * moment the summary lands.
 * @param archivedIds - the registry-global archive set, in archive order.
 * @param byId - Session summaries by id.
 * @returns the rows that have a summary to label them.
 */
export function archiveRowsOf(
  archivedIds: readonly string[],
  byId: Readonly<Record<string, ArchiveSessionLike | undefined>>,
): ArchiveRow[] {
  const rows: ArchiveRow[] = []
  for (const id of archivedIds) {
    const summary = byId[id]
    if (summary === undefined) continue
    rows.push({ id, label: summary.displayTitle })
  }
  return rows
}

/**
 * The Sessions a bulk archive of one Workspace would actually move.
 *
 * Archiving does not touch Workspace accounting: an archived Session keeps its
 * slot in `sessionIds` so unarchiving can restore its position. That is why
 * the archive set has to be subtracted here. Without it, a folder whose
 * Sessions were all archived already would still report a full count and the
 * menu would offer to archive them a second time.
 *
 * Order follows the Workspace's own manual Session order, so the archive fills
 * in the order the user sees in the sidebar.
 * @param sessionIds - the Workspace's accounted Sessions, in display order.
 * @param archivedIds - the registry-global archive set.
 * @returns the not-yet-archived ids, in Workspace order.
 */
export function bulkArchiveTargets(
  sessionIds: readonly string[],
  archivedIds: readonly string[],
): string[] {
  const archived = new Set(archivedIds)
  return sessionIds.filter(id => !archived.has(id))
}
