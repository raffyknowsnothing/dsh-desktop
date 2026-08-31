/**
 * Desktop find-in-chat: registers the Option+F find bar into the frame-wide
 * `shell.overlay` slot. That slot is a root-scoped list rendered by every
 * shell the Desktop plugin can boot into (the upstream AppFrame in
 * compatibility mode, the Desktop-owned frames otherwise), so one registration
 * covers all three presentation modes.
 *
 * The entry carries the shortcut listener itself and renders nothing until the
 * chord fires, which keeps the feature to a single registration with no
 * service of its own.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `shell.overlay` slot into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../contracts.ts'
import { FindInChat } from './FindInChat.tsx'
import { zh, en, type FindInChatLocaleKey } from './find-in-chat-locales.ts'
import { installFindInChatStyles } from './find-in-chat-styles.ts'

/** Locale namespace owned by the Desktop find bar. */
export const FIND_IN_CHAT_LOCALE_NAMESPACE = 'desktop.find'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop find-in-chat panel copy. */
    'desktop.find': FindInChatLocaleKey
  }
}

/** Register the find bar into the frame-wide overlay layer. */
export function applyFindInChat(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(FIND_IN_CHAT_LOCALE_NAMESPACE, { zh, en }),
    'dsh-plugin-desktop: find-in-chat dictionaries',
  )
  ctx.effect(
    () => installFindInChatStyles(),
    'dsh-plugin-desktop: find-in-chat styles',
  )
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'find-in-chat',
    // Above the Desktop titlebar overlay (-1000) and any frame chrome.
    order: 1000,
    locale: FIND_IN_CHAT_LOCALE_NAMESPACE,
  }, FindInChat))
}
