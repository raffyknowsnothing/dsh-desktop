/**
 * WorkspaceDecor: folder colours and named dividers for the sidebar Workspace
 * list.
 *
 * The entry sits in `shell.overlay`, which is root-scoped and mounted for the
 * whole session in every presentation mode. That gives this component two
 * things it needs: a lifetime that outlives any individual sidebar render, and
 * the global `useWorkspaces` hook, which is what supplies stable Workspace ids
 * for a DOM the sidebar renders without any.
 *
 * Why decorate the DOM rather than register a component: `sidebar.workspaces`
 * is a single-occupant slot filled by upstream's Workspace browser, and it
 * declares no per-row seam. Taking the slot over would mean re-implementing
 * that browser's whole injected surface to change an icon's colour. The
 * reading and writing halves live in sidebar-workspace-rows.ts and
 * workspace-decor-paint.ts; this component owns the state, the observer, and
 * the menu.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges `useSessions` into the global slot props seat.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: merges `useWorkspaces` into the global slot props seat.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '../contracts.ts'
import { archiveRowsOf, bulkArchiveTargets } from './archive-model.ts'
import {
  ARCHIVE_HEADER_CLASS,
  ARCHIVE_ROW_ATTRIBUTE,
  clearArchiveSection,
  paintArchiveSection,
} from './archive-paint.ts'
import {
  addDivider,
  DECOR_PALETTE,
  EMPTY_DECOR,
  mintDividerId,
  reconcileDecor,
  readDecor,
  removeDivider,
  renameDivider,
  setWorkspaceColor,
  writeDecor,
  type DecorStorage,
  type WorkspaceDecorState,
} from './workspace-decor-store.ts'
import {
  identifyWorkspaceRows,
  readWorkspaceRows,
  sidebarRegion,
  sidebarTree,
  WORKSPACE_ROW_SELECTOR,
} from './sidebar-workspace-rows.ts'
import {
  clearDecor,
  DIVIDER_ATTRIBUTE,
  paintDividers,
  paintFolderColors,
} from './workspace-decor-paint.ts'
import { swatchNameKey, type WorkspaceDecorLocaleKey } from './workspace-decor-locales.ts'

/** Renderer-composed props: the overlay seat, this feature's dictionary, and the injected open action. */
export type WorkspaceDecorProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<'desktop.workspaceDecor'> & WorkspaceDecorInjected

/**
 * The injected open action, delivered by the entry's register `inject` face.
 * The archived group sits outside upstream's browser, so reopening an archived
 * Session has to go through the sessions service rather than a browser row.
 */
export interface WorkspaceDecorInjected {
  /** Select a Session as current; used by the archived rows. */
  openSession: (sessionId: string) => void
  /**
   * Archive many Sessions at once; used by the Workspace menu. Fire-and-forget
   * because the archived group is driven by the Workspace snapshot, so the
   * rows move on their own as the Host confirms each write.
   */
  archiveSessions: (sessionIds: readonly string[]) => void
  /**
   * Restore many Sessions out of the archive; used by the archived group's
   * menus. Fire-and-forget for the same reason as `archiveSessions`.
   */
  unarchiveSessions: (sessionIds: readonly string[]) => void
}

/**
 * How often the region is re-checked when no mutation has fired.
 *
 * The MutationObserver does the real work; this only catches the sidebar being
 * mounted, unmounted, or replaced wholesale, which no observer bound to the
 * old element could see.
 */
const REATTACH_MS = 700

/** Menu anchored to a Workspace row, or to one of our divider elements. */
type MenuState =
  | { readonly kind: 'workspace'; readonly workspaceId: string; readonly label: string; readonly x: number; readonly y: number }
  | { readonly kind: 'divider'; readonly dividerId: string; readonly label: string; readonly x: number; readonly y: number }
  | { readonly kind: 'archiveRow'; readonly sessionId: string; readonly label: string; readonly x: number; readonly y: number }
  | { readonly kind: 'archiveGroup'; readonly x: number; readonly y: number }

/** In-memory fallback so the component is inert rather than broken headless. */
function memoryStorage(): DecorStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

/**
 * The backing store. Private-mode browsers throw on `localStorage` access
 * itself, not just on write, so the probe is guarded too.
 */
function decorStorage(): DecorStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Blocked storage falls through to the in-memory stand-in.
  }
  return memoryStorage()
}

/**
 * Render the sidebar decoration layer and the menu that edits it.
 *
 * The gate covers `useSessions` as well as `useWorkspaces`: both are standard
 * hooks contributed by upstream applies whose activation order relative to
 * this entry is explicitly not constrained, and a throw here is fatal rather
 * than transient (the slot error boundary latches). The body mounts only once
 * both hooks exist, so the hook count never changes between renders.
 */
export function WorkspaceDecor(props: WorkspaceDecorProps) {
  if (typeof props.useWorkspaces !== 'function' || typeof props.useSessions !== 'function') return null
  return <WorkspaceDecorBody {...props} />
}

/** The decoration layer proper, mounted only with usable standard hooks. */
function WorkspaceDecorBody({
  t, useWorkspaces, useSessions, openSession, archiveSessions, unarchiveSessions,
}: WorkspaceDecorProps) {
  const snapshot = useWorkspaces(state => state)
  const sessionsSnapshot = useSessions(state => state)
  // Resolved before the initial state reads it, so both halves share one
  // store. Two calls to decorStorage() would hand the in-memory fallback a
  // different map to read from than the one it writes to.
  const storageRef = useRef<DecorStorage | null>(null)
  storageRef.current ??= decorStorage()
  const [decor, setDecor] = useState<WorkspaceDecorState>(
    () => storageRef.current === null ? EMPTY_DECOR : readDecor(storageRef.current),
  )
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** Divider label being edited; null while the menu shows its actions. */
  const [draft, setDraft] = useState<string | null>(null)
  /** Whether the archived group's rows are shown; the header toggles it. */
  const [archiveExpanded, setArchiveExpanded] = useState(true)
  /**
   * Whether the Workspace menu is asking to confirm a bulk archive.
   *
   * Bulk archive is the one destructive-feeling action in this menu: it can
   * move a whole folder's conversations out of the list in one click, and
   * putting them back is one restore per conversation. So it asks first.
   */
  const [confirmBulk, setConfirmBulk] = useState(false)

  const workspaceIds = useMemo(
    () => snapshot.items.map(workspace => String(workspace.workspaceId)),
    [snapshot.items],
  )

  // The archived group renders only once the Workspace list is settled: the
  // archive set is authoritative after the phase turns ready, and Session
  // summaries fill in as the Sessions list pulls them.
  const archivedIds = useMemo(
    () => snapshot.phase === 'ready' ? [...snapshot.archivedSessionIds] : [],
    [snapshot.phase, snapshot.archivedSessionIds],
  )
  const archiveRows = useMemo(
    () => archiveRowsOf(archivedIds, sessionsSnapshot.byId),
    [archivedIds, sessionsSnapshot.byId],
  )

  /**
   * The Sessions a bulk archive would move, for the Workspace the menu is open
   * on.
   *
   * Already-archived ids are filtered out so the count names what will
   * actually happen. `sessionIds` keeps an archived Session's slot, so without
   * the filter a folder whose Sessions were all archived would still offer to
   * archive them again.
   */
  const bulkTargets = useMemo((): readonly string[] => {
    if (menu === null || menu.kind !== 'workspace') return []
    const workspace = snapshot.items.find(
      item => String(item.workspaceId) === menu.workspaceId,
    )
    if (workspace === undefined) return []
    // Both sides mapped to plain strings: the ids are branded SessionIds on the
    // snapshot, and this component works in strings throughout because the DOM
    // it decorates carries them as attribute values.
    return bulkArchiveTargets(workspace.sessionIds.map(String), archivedIds.map(String))
  }, [menu, snapshot.items, archivedIds])

  const commit = useCallback((next: WorkspaceDecorState): void => {
    setDecor(next)
    if (storageRef.current !== null) writeDecor(storageRef.current, next)
  }, [])

  // Reconcile against a settled list only. Running this while the list is
  // still loading would read every Workspace as deleted and wipe the lot.
  useEffect(() => {
    if (snapshot.phase !== 'ready') return
    setDecor((current) => {
      const next = reconcileDecor(current, workspaceIds)
      if (next === current) return current
      if (storageRef.current !== null) writeDecor(storageRef.current, next)
      return next
    })
  }, [snapshot.phase, workspaceIds])

  // The paint closure changes with every state change, but the observer must
  // not be rebuilt that often; the ref lets the observer always call the
  // current one.
  // Every DOM read and write is wrapped, for the same reason the hook is
  // gated above: this runs from an effect and from a MutationObserver, and a
  // throw out of either latches the slot error boundary and kills the feature
  // for the session. Decoration failing to appear is a small problem; it
  // failing loudly and permanently is a much larger one.
  const paint = useCallback((): void => {
    try {
      const region = sidebarRegion(typeof document === 'undefined' ? undefined : document)
      if (region === null) return
      const rows = readWorkspaceRows(region)
      const identified = identifyWorkspaceRows(rows, workspaceIds)
      paintFolderColors(identified, decor)
      paintDividers(region, identified, decor)
      // The archived group lives in the same tree, at the very end of it:
      // below every Workspace section and below the Ungrouped bucket. A null
      // anchor is what puts it there. It sat above the bucket first, which
      // read as the archive interrupting the live list rather than closing
      // it. Grouped view only: flat and search views render no Workspace
      // sections and no group language to match. An empty row list makes the
      // painter remove any lingering section, so a view switch cannot leave
      // one behind.
      const tree = sidebarTree(region)
      if (tree !== null) {
        const grouped = rows.length > 0
        const headerLabel = t('archive.header', { count: String(archiveRows.length) })
        paintArchiveSection(
          tree,
          null,
          grouped ? archiveRows : [],
          headerLabel,
          archiveExpanded,
        )
      }
    } catch (error) {
      console.error('dsh-plugin-desktop: sidebar decoration paint failed', error)
    }
  }, [decor, workspaceIds, archiveRows, archiveExpanded, t])
  const paintRef = useRef(paint)
  useLayoutEffect(() => {
    paintRef.current = paint
    paint()
  }, [paint])

  // Watch the region for re-renders, and re-attach when the sidebar itself is
  // replaced. Observing the region rather than the document keeps this off the
  // transcript's mutation traffic, which is heavy during streaming.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
    let observed: HTMLElement | null = null

    // Runaway guard. This observer watches a subtree that its own callback
    // writes into, so any placement bug that is not perfectly idempotent
    // becomes an unbounded mutation loop that pegs the main thread and freezes
    // the window. One shipped as exactly that: two dividers parked at the tail
    // each unseated the other, forever.
    //
    // The placement bug is fixed, but the shape of this code invites more, and
    // a frozen app is far worse than decoration that stops updating. So the
    // observer counts its own firings and disconnects if they run away. The
    // interval below still re-attaches, so the feature recovers on the next
    // settled render instead of dying for the session.
    const BURST_LIMIT = 60
    const BURST_WINDOW_MS = 1000
    let burstStart = 0
    let burstCount = 0
    const observer = new MutationObserver(() => {
      const now = Date.now()
      if (now - burstStart > BURST_WINDOW_MS) {
        burstStart = now
        burstCount = 0
      }
      burstCount += 1
      if (burstCount > BURST_LIMIT) {
        observer.disconnect()
        observed = null
        console.error('dsh-plugin-desktop: sidebar decoration repaint loop detected; observer detached')
        return
      }
      paintRef.current()
    })
    const attach = (): void => {
      const region = sidebarRegion(document)
      if (region === observed && (region === null || region.isConnected)) return
      observer.disconnect()
      observed = region
      if (region === null) return
      observer.observe(region, { childList: true, subtree: true })
      paintRef.current()
    }
    attach()
    const timer = setInterval(attach, REATTACH_MS)
    return () => {
      clearInterval(timer)
      observer.disconnect()
      const region = sidebarRegion(document)
      clearDecor(region)
      clearArchiveSection(region)
    }
  }, [])

  // Clicks on the archived group: a row reopens its Session, the header folds
  // and unfolds the rows. Delegated on the region like the context menu, so it
  // never shadows clicks anywhere else in the app.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const region = sidebarRegion(document)
      if (region === null || !region.contains(target)) return

      const header = target.closest<HTMLElement>(`.${ARCHIVE_HEADER_CLASS}`)
      if (header !== null) {
        setArchiveExpanded(current => !current)
        return
      }
      const row = target.closest<HTMLElement>(`[${ARCHIVE_ROW_ATTRIBUTE}]`)
      if (row === null) return
      const sessionId = row.getAttribute(ARCHIVE_ROW_ATTRIBUTE)
      if (sessionId === null) return
      openSession(sessionId)
    }
    document.addEventListener('click', onClick)
    return () => { document.removeEventListener('click', onClick) }
  }, [openSession])

  // Right-click opens the menu, on a Workspace row or on one of our dividers.
  // Bound to the region rather than the document so it never shadows a
  // context menu anywhere else in the app.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onContextMenu = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const region = sidebarRegion(document)
      if (region === null || !region.contains(target)) return

      // The archived group's own menus come first: a restore action on one
      // row, and restore-all on the group header. Both are checked before the
      // Workspace row lookup, because the group sits inside the same tree and
      // a header is not a Workspace row.
      const archiveRow = target.closest<HTMLElement>(`[${ARCHIVE_ROW_ATTRIBUTE}]`)
      if (archiveRow !== null) {
        const sessionId = archiveRow.getAttribute(ARCHIVE_ROW_ATTRIBUTE)
        if (sessionId === null) return
        event.preventDefault()
        setDraft(null)
        setMenu({
          kind: 'archiveRow',
          sessionId,
          label: archiveRow.textContent ?? '',
          x: event.clientX,
          y: event.clientY,
        })
        return
      }
      if (target.closest<HTMLElement>(`.${ARCHIVE_HEADER_CLASS}`) !== null) {
        event.preventDefault()
        setDraft(null)
        setMenu({ kind: 'archiveGroup', x: event.clientX, y: event.clientY })
        return
      }

      const dividerElement = target.closest<HTMLElement>(`[${DIVIDER_ATTRIBUTE}]`)
      if (dividerElement !== null) {
        const dividerId = dividerElement.getAttribute(DIVIDER_ATTRIBUTE)
        if (dividerId === null) return
        const record = decor.dividers.find(entry => entry.id === dividerId)
        event.preventDefault()
        setDraft(null)
        setMenu({ kind: 'divider', dividerId, label: record?.label ?? '', x: event.clientX, y: event.clientY })
        return
      }

      const rowElement = target.closest<HTMLElement>(WORKSPACE_ROW_SELECTOR)
      if (rowElement === null) return
      const rows = identifyWorkspaceRows(readWorkspaceRows(region), workspaceIds)
      const match = rows.find(row => row.row === rowElement)
      // No match means the Ungrouped bucket, which owns no Workspace and so
      // has nothing to colour or pin a divider to.
      if (match === undefined) return
      event.preventDefault()
      setDraft(null)
      setMenu({
        kind: 'workspace',
        workspaceId: match.workspaceId,
        label: match.label,
        x: event.clientX,
        y: event.clientY,
      })
    }
    document.addEventListener('contextmenu', onContextMenu)
    return () => { document.removeEventListener('contextmenu', onContextMenu) }
  }, [decor.dividers, workspaceIds])

  const close = useCallback((): void => {
    setMenu(null)
    setDraft(null)
    setConfirmBulk(false)
  }, [])

  if (menu === null) return null
  return (
    <DecorMenu
      menu={menu}
      draft={draft}
      decor={decor}
      t={t}
      bulkTargets={bulkTargets}
      confirmBulk={confirmBulk}
      archivedCount={archiveRows.length}
      onClose={close}
      onRestoreOne={() => {
        if (menu.kind !== 'archiveRow') return
        unarchiveSessions([menu.sessionId])
        close()
      }}
      onRestoreAll={() => {
        if (menu.kind !== 'archiveGroup' || archiveRows.length === 0) return
        unarchiveSessions(archiveRows.map(row => row.id))
        close()
      }}
      onAskBulkArchive={() => { setConfirmBulk(true) }}
      onConfirmBulkArchive={() => {
        if (menu.kind !== 'workspace' || bulkTargets.length === 0) return
        archiveSessions(bulkTargets)
        close()
      }}
      onPickColor={(colorId) => {
        if (menu.kind !== 'workspace') return
        commit(setWorkspaceColor(decor, menu.workspaceId, colorId))
        close()
      }}
      onAddDivider={() => {
        if (menu.kind !== 'workspace') return
        // Straight into the label field: a divider is created to be named, and
        // an unnamed one is indistinguishable from the plain rule. The id is
        // minted here rather than left to addDivider's default because the
        // menu has to switch to the divider it just made.
        const id = mintDividerId()
        commit(addDivider(decor, menu.workspaceId, '', id))
        setMenu({ kind: 'divider', dividerId: id, label: '', x: menu.x, y: menu.y })
        setDraft('')
      }}
      onStartRename={() => { setDraft(menu.kind === 'divider' ? menu.label : '') }}
      onDraftChange={setDraft}
      onSubmitRename={() => {
        if (menu.kind !== 'divider' || draft === null) return
        commit(renameDivider(decor, menu.dividerId, draft.trim()))
        close()
      }}
      onRemoveDivider={() => {
        if (menu.kind !== 'divider') return
        commit(removeDivider(decor, menu.dividerId))
        close()
      }}
    />
  )
}

/** Props for the anchored menu. */
interface DecorMenuProps {
  menu: MenuState
  draft: string | null
  decor: WorkspaceDecorState
  t: (key: WorkspaceDecorLocaleKey, params?: Record<string, string | number>) => string
  /** Sessions a bulk archive would move; its length drives the menu copy. */
  bulkTargets: readonly string[]
  /** Whether the menu is showing the bulk-archive confirmation. */
  confirmBulk: boolean
  /** How many Sessions the archived group currently lists. */
  archivedCount: number
  onClose: () => void
  onAskBulkArchive: () => void
  onConfirmBulkArchive: () => void
  onRestoreOne: () => void
  onRestoreAll: () => void
  onPickColor: (colorId: string | null) => void
  onAddDivider: () => void
  onStartRename: () => void
  onDraftChange: (value: string) => void
  onSubmitRename: () => void
  onRemoveDivider: () => void
}

/**
 * The right-click menu.
 *
 * Positioned as a fixed element at the pointer, then nudged back inside the
 * viewport once its real size is known. Fixed rather than absolute because the
 * sidebar scrolls and clips, and a menu that scrolled away with the row it
 * belongs to would be worse than one that stays put.
 */
function DecorMenu({
  menu, draft, decor, t, bulkTargets, confirmBulk, archivedCount, onClose, onPickColor,
  onAddDivider, onAskBulkArchive, onConfirmBulkArchive, onRestoreOne, onRestoreAll,
  onStartRename, onDraftChange, onSubmitRename, onRemoveDivider,
}: DecorMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)
  const [position, setPosition] = useState({ left: menu.x, top: menu.y })

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    const margin = 8
    const left = Math.max(margin, Math.min(menu.x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(menu.y, window.innerHeight - rect.height - margin))
    setPosition({ left, top })
  }, [menu.x, menu.y, draft])

  useEffect(() => { fieldRef.current?.focus() }, [draft === null])

  // Escape and any outside press close. Both are captured at the document so a
  // press inside the sidebar closes the menu rather than opening a second one.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    }
    const onPointerDown = (event: MouseEvent): void => {
      const element = ref.current
      if (element !== null && event.target instanceof Node && element.contains(event.target)) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown, true)
    }
  }, [onClose])

  const active = menu.kind === 'workspace' ? decor.colors[menu.workspaceId] : undefined

  return (
    <div
      ref={ref}
      className="dshWsMenu"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      role="menu"
      aria-label={menuAriaLabel(menu, t)}
    >
      {menu.kind === 'workspace' && (
        <>
          <div className="dshWsMenuTitle">{t('color.label')}</div>
          <div className="dshWsSwatches">
            <button
              type="button"
              className="dshWsSwatch"
              data-default="true"
              aria-pressed={active === undefined}
              aria-label={t('color.default')}
              title={t('color.default')}
              onClick={() => { onPickColor(null) }}
            >
              <span className="dshWsSwatchDot" />
            </button>
            {DECOR_PALETTE.map((swatch) => {
              const name = t(swatchNameKey(swatch.id))
              return (
                <button
                  key={swatch.id}
                  type="button"
                  className="dshWsSwatch"
                  aria-pressed={active === swatch.id}
                  aria-label={name}
                  title={name}
                  onClick={() => { onPickColor(swatch.id) }}
                >
                  <span
                    className="dshWsSwatchDot"
                    style={{ ['--dsh-ws-swatch' as string]: swatch.value }}
                  />
                </button>
              )
            })}
          </div>
          <div className="dshWsMenuSep" />
          <button type="button" className="dshWsMenuItem" role="menuitem" onClick={onAddDivider}>
            {t('divider.add')}
          </button>
          <div className="dshWsMenuSep" />
          {confirmBulk
            ? (
              <>
                <div className="dshWsMenuNote">
                  {t('archive.bulkConfirm', { count: bulkTargets.length })}
                </div>
                <button
                  type="button"
                  className="dshWsMenuItem"
                  role="menuitem"
                  data-danger="true"
                  onClick={onConfirmBulkArchive}
                >
                  {t('archive.bulkConfirmAction')}
                </button>
                <button type="button" className="dshWsMenuItem" role="menuitem" onClick={onClose}>
                  {t('cancel')}
                </button>
              </>
            )
            : (
              <button
                type="button"
                className="dshWsMenuItem"
                role="menuitem"
                // Nothing to archive still renders, greyed, rather than
                // vanishing: a menu whose items move between folders is harder
                // to use than one that says why an action is unavailable.
                disabled={bulkTargets.length === 0}
                onClick={onAskBulkArchive}
              >
                {bulkTargets.length === 0
                  ? t('archive.bulkEmpty')
                  : t('archive.bulk', { count: bulkTargets.length })}
              </button>
            )}
        </>
      )}

      {menu.kind === 'archiveRow' && (
        <button type="button" className="dshWsMenuItem" role="menuitem" onClick={onRestoreOne}>
          {t('archive.restore')}
        </button>
      )}

      {menu.kind === 'archiveGroup' && (
        <button
          type="button"
          className="dshWsMenuItem"
          role="menuitem"
          disabled={archivedCount === 0}
          onClick={onRestoreAll}
        >
          {t('archive.restoreAll', { count: archivedCount })}
        </button>
      )}

      {menu.kind === 'divider' && draft === null && (
        <>
          <button type="button" className="dshWsMenuItem" role="menuitem" onClick={onStartRename}>
            {t('divider.rename')}
          </button>
          <button
            type="button"
            className="dshWsMenuItem"
            role="menuitem"
            data-danger="true"
            onClick={onRemoveDivider}
          >
            {t('divider.remove')}
          </button>
        </>
      )}

      {menu.kind === 'divider' && draft !== null && (
        <>
          <input
            ref={fieldRef}
            className="dshWsMenuField"
            value={draft}
            placeholder={t('divider.placeholder')}
            aria-label={t('divider.placeholder')}
            onChange={(event) => { onDraftChange(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); onSubmitRename() }
            }}
          />
          <button type="button" className="dshWsMenuItem" role="menuitem" onClick={onSubmitRename}>
            {t('save')}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * The menu's accessible name, which differs per anchor.
 *
 * Split out of the render because the menu now has four anchors and a nested
 * ternary chain over them is unreadable.
 * @param menu - the open menu's anchor.
 * @param t - this feature's dictionary.
 * @returns the localized accessible name.
 */
function menuAriaLabel(
  menu: MenuState,
  t: DecorMenuProps['t'],
): string {
  switch (menu.kind) {
    case 'workspace': return t('menu.workspace.aria', { name: menu.label })
    case 'divider': return t('menu.divider.aria')
    case 'archiveRow': return t('archive.rowAria', { name: menu.label })
    case 'archiveGroup': return t('archive.groupAria')
  }
}
