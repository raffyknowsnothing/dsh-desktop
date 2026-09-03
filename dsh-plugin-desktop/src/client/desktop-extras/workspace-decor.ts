/**
 * Desktop sidebar decoration: registers the folder-colour and divider layer
 * into the frame-wide `shell.overlay` slot.
 *
 * Same seat as find-in-chat, and for the same reason: `shell.overlay` is
 * root-scoped and rendered by every shell the Desktop plugin can boot into, so
 * one registration covers all three presentation modes. The entry renders
 * nothing until a Workspace row is right-clicked; its real work is the
 * decoration effect it owns.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `shell.overlay` slot into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls `ctx.sessions` into the client Context.
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls `ctx.workspaces` into the client Context.
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '../contracts.ts'
import { WorkspaceDecor, type WorkspaceDecorInjected } from './WorkspaceDecor.tsx'
import { installArchiveStyles } from './archive-styles.ts'
import { en, zh, type WorkspaceDecorLocaleKey } from './workspace-decor-locales.ts'
import { installWorkspaceDecorStyles } from './workspace-decor-styles.ts'

/** Locale namespace owned by the sidebar decoration layer. */
export const WORKSPACE_DECOR_LOCALE_NAMESPACE = 'desktop.workspaceDecor'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar folder-colour and divider copy. */
    'desktop.workspaceDecor': WorkspaceDecorLocaleKey
  }
}

/**
 * Archive every named Session, one at a time.
 *
 * Sequential rather than `Promise.all`: the Host registry serializes archive
 * writes on one operation chain anyway, so a parallel fan-out would only queue
 * the same work behind the same lock while making the failure story worse. One
 * at a time means a mid-run failure leaves a known prefix archived, and the
 * rest simply are not.
 *
 * A failure stops the run rather than pressing on. The archive set is durable
 * state and the sidebar shows the result immediately, so a partial run is
 * visible and repeatable; grinding through 20 more calls that will fail the
 * same way is not.
 * @param ctx - browser Cordis context owning the Workspace client service.
 * @param sessionIds - Sessions to archive, in sidebar order.
 */
async function archiveEach(
  ctx: ClientContext,
  sessionIds: readonly string[],
): Promise<void> {
  for (const sessionId of sessionIds) {
    try {
      await ctx.workspaces.archiveSession(sessionId as SessionId)
    } catch (error) {
      console.error('dsh-plugin-desktop: bulk archive stopped', error)
      return
    }
  }
}

/**
 * Restore every named Session out of the archive, one at a time.
 *
 * The mirror of {@link archiveEach}, and sequential for the same reason. A
 * restored Session rejoins the Workspace that still accounts it, in the slot it
 * kept while archived, because archiving never touched Workspace accounting.
 * @param ctx - browser Cordis context owning the Workspace client service.
 * @param sessionIds - Sessions to restore.
 */
async function unarchiveEach(
  ctx: ClientContext,
  sessionIds: readonly string[],
): Promise<void> {
  for (const sessionId of sessionIds) {
    try {
      await ctx.workspaces.unarchiveSession(sessionId as SessionId)
    } catch (error) {
      console.error('dsh-plugin-desktop: restore stopped', error)
      return
    }
  }
}

/** Register the sidebar decoration layer into the frame-wide overlay. */
export function applyWorkspaceDecor(ctx: ClientContext): void {
  /** The actions the archived group and the Workspace menu call. */
  const inject = (): WorkspaceDecorInjected => ({
    openSession: (sessionId) => { ctx.sessions.open(sessionId as SessionId) },
    archiveSessions: (sessionIds) => { void archiveEach(ctx, sessionIds) },
    unarchiveSessions: (sessionIds) => { void unarchiveEach(ctx, sessionIds) },
  })
  ctx.effect(
    () => ctx.locale.register(WORKSPACE_DECOR_LOCALE_NAMESPACE, { zh, en }),
    'dsh-plugin-desktop: workspace decoration dictionaries',
  )
  ctx.effect(
    () => installWorkspaceDecorStyles(),
    'dsh-plugin-desktop: workspace decoration styles',
  )
  ctx.effect(
    () => installArchiveStyles(),
    'dsh-plugin-desktop: archived group styles',
  )
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'workspace-decor',
    // Below find-in-chat (1000): the find bar is a transient panel over the
    // conversation, and nothing here should ever cover it.
    order: 900,
    locale: WORKSPACE_DECOR_LOCALE_NAMESPACE,
    inject,
  }, WorkspaceDecor))
}
