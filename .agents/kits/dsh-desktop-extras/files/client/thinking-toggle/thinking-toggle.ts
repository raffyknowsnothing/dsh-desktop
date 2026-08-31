/**
 * Desktop thinking toggle: registers the composer's quick thinking on/off
 * switch into the `conversation.input.right` slot. The switch shares the
 * per-session ModelDirectory service with the model seat, so a flip keeps the
 * model pill's effort label in step. Uses `ctx.inject` so only this feature
 * waits on `modelDirectories`; the rest of the Desktop plugin activates
 * independently of it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ModelSelection, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the composer `conversation.input.right` slot into SlotMap.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { ThinkingToggle, type ThinkingToggleInjected } from './ThinkingToggle.tsx'
import { zh, en, type ThinkingToggleLocaleKey } from './thinking-toggle-locales.ts'
import { installThinkingToggleStyles } from './thinking-toggle-styles.ts'

/** Locale namespace owned by the Desktop thinking toggle. */
export const THINKING_TOGGLE_LOCALE_NAMESPACE = 'desktop.thinking'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop thinking-toggle composer copy. */
    'desktop.thinking': ThinkingToggleLocaleKey
  }
}

/** Register the thinking toggle into the composer tool row. */
export function applyThinkingToggle(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(THINKING_TOGGLE_LOCALE_NAMESPACE, { zh, en }),
    'dsh-plugin-desktop: thinking toggle dictionaries',
  )
  ctx.effect(
    () => installThinkingToggleStyles(),
    'dsh-plugin-desktop: thinking toggle styles',
  )
  ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right',
      id: 'thinking-toggle',
      order: 10,
      locale: THINKING_TOGGLE_LOCALE_NAMESPACE,
      inject: (sessionId: SessionId): ThinkingToggleInjected => {
        const directory = scope.modelDirectories.directoryFor(sessionId)
        const available = scope.sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => { if (available) directory.load().catch(() => { /* surfaced on the store */ }) },
          select: (selection: ModelSelection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
        }
      },
    }, ThinkingToggle))
  })
}
