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

/** Register the sidebar decoration layer into the frame-wide overlay. */
export function applyWorkspaceDecor(ctx: ClientContext): void {
  /** The open action the archived group's rows call. */
  const inject = (): WorkspaceDecorInjected => ({
    openSession: (sessionId) => { ctx.sessions.open(sessionId as SessionId) },
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
