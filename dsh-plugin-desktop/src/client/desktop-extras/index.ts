/**
 * Desktop extras: the Desktop-owned client affordances that sit outside the
 * shell, settings, and window-geometry features.
 *
 * Everything here is additive and self-contained. One call to
 * {@link applyDesktopExtras} from the client plugin's `apply` installs the
 * whole set, and nothing else in the plugin imports from this directory, so
 * the folder plus that one call is the entire footprint. See INSTALL.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { applyFindInChat } from './find-in-chat.ts'
import { applyPreferencesShortcut } from './preferences-shortcut.ts'

export { applyFindInChat, FIND_IN_CHAT_LOCALE_NAMESPACE } from './find-in-chat.ts'
export { FindInChat } from './FindInChat.tsx'
export type { FindInChatProps } from './FindInChat.tsx'
export {
  applyPreferencesShortcut,
  installPreferencesShortcut,
  settingsTrigger,
  SETTINGS_TRIGGER_SELECTOR,
} from './preferences-shortcut.ts'
export {
  FIND_IN_CHAT_BINDING,
  PREFERENCES_BINDINGS,
  matches,
  matchesAny,
} from './keybindings.ts'
export type { DesktopKeyBinding } from './keybindings.ts'
export {
  buildSearchIndex,
  chunkRangeOf,
  findMatches,
  foldQuery,
  BLOCK_BOUNDARY,
} from './transcript-index.ts'
export type { ChunkPosition, SearchIndex, SearchMatch } from './transcript-index.ts'
export {
  clearMatches,
  paintMatches,
  revealMatch,
  searchTranscript,
} from './transcript-search.ts'
export type { TranscriptMatch } from './transcript-search.ts'

/**
 * Install every Desktop extra for one Cordis generation.
 * @param ctx - browser Cordis context.
 */
export function applyDesktopExtras(ctx: ClientContext): void {
  applyFindInChat(ctx)
  applyPreferencesShortcut(ctx)
}
