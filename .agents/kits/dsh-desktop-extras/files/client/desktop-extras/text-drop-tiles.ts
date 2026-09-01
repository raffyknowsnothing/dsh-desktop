/**
 * Registers the staged-file tile rail above the composer.
 *
 * `conversation.input.dock` is a session-scoped list slot rendered full width
 * above the composer card. Session scope is the point: it is what delivers
 * `inputActions`, without which the rail could neither write the draft nor
 * submit it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TextDropTiles } from './TextDropTiles.tsx'
import { en, zh, type TextDropLocaleKey } from './text-drop-locales.ts'
import { installTextDropStyles } from './text-drop-styles.ts'

/** Locale namespace owned by the staged-file tiles. */
export const TEXT_DROP_LOCALE_NAMESPACE = 'desktop.textDrop'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Staged-file tile copy. */
    'desktop.textDrop': TextDropLocaleKey
  }
}

/** Register the tile rail into the composer dock. */
export function applyTextDropTiles(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(TEXT_DROP_LOCALE_NAMESPACE, { zh, en }),
    'dsh-plugin-desktop: staged-file tile dictionaries',
  )
  ctx.effect(
    () => installTextDropStyles(),
    'dsh-plugin-desktop: staged-file tile styles',
  )
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'text-drop-tiles',
    // Below whatever upstream docks above the composer; the rail is the
    // user's own staged material and belongs closest to the input.
    order: 500,
    locale: TEXT_DROP_LOCALE_NAMESPACE,
  }, TextDropTiles))
}
