/**
 * Archive list model: which archived Sessions the sidebar group shows.
 */
import { describe, expect, it } from 'vitest'
import {
  archiveRowsOf,
  bulkArchiveTargets,
  type ArchiveRow,
} from '../src/client/desktop-extras/archive-model.ts'

const byId = {
  's1': { displayTitle: 'First chat' },
  's2': { displayTitle: 'Sound design notes' },
  's3': { displayTitle: 'Deep dive' },
}

describe('archiveRowsOf', () => {
  it('keeps archive order', () => {
    const rows = archiveRowsOf(['s2', 's1', 's3'], byId)
    expect(rows.map(row => row.id)).toEqual(['s2', 's1', 's3'])
  })

  it('labels each row with the display title', () => {
    const rows = archiveRowsOf(['s1'], byId)
    expect(rows[0]).toEqual({ id: 's1', label: 'First chat' })
  })

  it('skips sessions the snapshot has not pulled yet', () => {
    const rows = archiveRowsOf(['s1', 'missing', 's2'], byId)
    expect(rows.map(row => row.id)).toEqual(['s1', 's2'])
  })

  it('returns an empty list when nothing is archived', () => {
    expect(archiveRowsOf([], byId)).toEqual([])
  })

  it('returns an empty list when every archived id is unknown', () => {
    expect(archiveRowsOf(['nope', 'gone'], {})).toEqual([])
  })

  it('types the rows as read-only archive rows', () => {
    const rows: readonly ArchiveRow[] = archiveRowsOf(['s3'], byId)
    expect(rows[0]?.label).toBe('Deep dive')
  })
})

describe('bulkArchiveTargets', () => {
  it('keeps the workspace display order', () => {
    expect(bulkArchiveTargets(['s3', 's1', 's2'], [])).toEqual(['s3', 's1', 's2'])
  })

  it('subtracts sessions that are already archived', () => {
    // Archiving keeps a session's `sessionIds` slot so unarchiving can restore
    // its position, so the workspace still lists ids that are in the archive.
    expect(bulkArchiveTargets(['s1', 's2', 's3'], ['s2'])).toEqual(['s1', 's3'])
  })

  it('returns nothing when the whole folder is already archived', () => {
    // This is what greys the menu item out; a full count here would offer to
    // archive the same conversations a second time.
    expect(bulkArchiveTargets(['s1', 's2'], ['s2', 's1'])).toEqual([])
  })

  it('ignores archived ids from other workspaces', () => {
    expect(bulkArchiveTargets(['s1'], ['s9', 's8'])).toEqual(['s1'])
  })

  it('returns nothing for an empty folder', () => {
    expect(bulkArchiveTargets([], ['s1'])).toEqual([])
  })
})
