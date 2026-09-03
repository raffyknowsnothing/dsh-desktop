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
import { applyTextDrop } from './text-drop.ts'
import { applyTextDropTiles } from './text-drop-tiles.ts'
import { applyWorkspaceDecor } from './workspace-decor.ts'

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
export { applyWorkspaceDecor, WORKSPACE_DECOR_LOCALE_NAMESPACE } from './workspace-decor.ts'
export { WorkspaceDecor } from './WorkspaceDecor.tsx'
export type { WorkspaceDecorInjected, WorkspaceDecorProps } from './WorkspaceDecor.tsx'
export {
  archiveRowsOf,
  bulkArchiveTargets,
} from './archive-model.ts'
export type { ArchiveRow } from './archive-model.ts'
export {
  ARCHIVE_HEADER_CLASS,
  ARCHIVE_ROW_ATTRIBUTE,
  ARCHIVE_ROW_CLASS,
  ARCHIVE_ROW_LABEL_CLASS,
  ARCHIVE_SECTION_ATTRIBUTE,
  ARCHIVE_SECTION_CLASS,
  clearArchiveSection,
  paintArchiveSection,
} from './archive-paint.ts'
export {
  addDivider,
  DECOR_PALETTE,
  DECOR_STORAGE_KEY,
  dividersAbove,
  dividersAtTail,
  EMPTY_DECOR,
  mintDividerId,
  reconcileDecor,
  readDecor,
  removeDivider,
  renameDivider,
  setWorkspaceColor,
  swatchValue,
  TAIL_ANCHOR,
  writeDecor,
} from './workspace-decor-store.ts'
export type {
  DecorStorage,
  DecorSwatch,
  DividerRecord,
  WorkspaceDecorState,
} from './workspace-decor-store.ts'
export {
  identifyWorkspaceRows,
  readWorkspaceRows,
  sidebarRegion,
  sidebarTree,
  glyphSpans,
  rowLabel,
  sectionOf,
  SIDEBAR_REGION_SELECTOR,
  TREE_SELECTOR,
  WORKSPACE_ROW_SELECTOR,
} from './sidebar-workspace-rows.ts'
export type { IdentifiedWorkspaceRow, SidebarWorkspaceRow } from './sidebar-workspace-rows.ts'
export {
  clearDecor,
  paintDividers,
  paintFolderColors,
  DIVIDER_ATTRIBUTE,
  FOLDER_ATTRIBUTE,
} from './workspace-decor-paint.ts'
export { applyTextDrop, installTextDrop, insertIntoComposer, COMPOSER_SELECTOR } from './text-drop.ts'
export { applyTextDropTiles, TEXT_DROP_LOCALE_NAMESPACE } from './text-drop-tiles.ts'
export { installTextDropStyles, TEXT_DROP_CSS } from './text-drop-styles.ts'
export { TextDropTiles } from './TextDropTiles.tsx'
export type { TextDropTilesProps } from './TextDropTiles.tsx'
export {
  clearStaged,
  composeMessage,
  hasStagingHost,
  mintStagedId,
  registerStagingHost,
  resetStaging,
  stagedFiles,
  stageFiles,
  subscribeStaged,
  unstageFile,
} from './text-drop-store.ts'
export type { StagedFile } from './text-drop-store.ts'
export {
  capContent,
  dragCarriesFiles,
  extensionOf,
  fenceFile,
  isTextFile,
  joinBlocks,
  longestBacktickRun,
  ownsDrop,
  MAX_INLINE_BYTES,
  TEXT_EXTENSIONS,
  TRUNCATION_NOTICE,
} from './text-drop-model.ts'
export type { TextFileLike } from './text-drop-model.ts'

/**
 * Install every Desktop extra for one Cordis generation.
 * @param ctx - browser Cordis context.
 */
export function applyDesktopExtras(ctx: ClientContext): void {
  applyFindInChat(ctx)
  applyPreferencesShortcut(ctx)
  applyWorkspaceDecor(ctx)
  applyTextDrop(ctx)
  applyTextDropTiles(ctx)
}
