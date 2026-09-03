# Desktop extras install kit

Five Desktop-owned client affordances, packaged so they can be reapplied to a
fresh checkout after the app updates from `master`. This directory is
self-contained: pristine copies of every file live in `files/`.

Everything is additive. No upstream file is patched, and nothing under
`deepseek-harness/` is touched.

Most of the time you want the installer, not this document:

```bash
node .agents/kits/dsh-desktop-extras/install.mjs
```

Read on when the installer reports a missing anchor, or when you need to know
why something is built the way it is. The manual steps below are what the
installer does, written out.

## What gets installed

| Feature | Binding | Where it lives |
| --- | --- | --- |
| Find in chat | Option+F (Alt+F) | `shell.overlay` slot, root scope |
| Preferences | Cmd+, on macOS, Ctrl+, elsewhere | document keydown listener |
| Thinking mode pill | composer toggle, no chord | `conversation.input.right` slot |
| Workspace folder colours and dividers | right-click a sidebar Workspace row | `shell.overlay` slot, root scope |
| Text files into the composer | drop or paste a file onto the chat | capture-phase listeners + `conversation.input.dock` |

Cmd+F stays with the surrounding app, which is why find uses Option+F. Change
either chord in `keybindings.ts`; both are declared as data at the top of that
file and nothing else hardcodes a key.

The thinking pill predates this kit and lives flat in `src/client/` rather than
in a folder of its own. `files/client/thinking-toggle/` carries a copy anyway,
and the installer restores it only when a merge has actually dropped it. An
existing copy is left alone.

### Workspace folder colours and dividers

Right-clicking a Workspace row in the sidebar opens a Desktop-owned menu: eight
folder colours plus a default that clears the colour, and an action that adds a
named divider above that Workspace. Right-clicking a divider renames or removes
it. Colours key on the Workspace id, so renaming a Workspace keeps its colour,
and dividers pin above a Workspace rather than to a position, so reordering the
sidebar carries them along.

Upstream hides archived Sessions from every grouping surface and ships no
archive UI, so this layer also draws an **Archived** group into the grouped
tree, at the bottom below Ungrouped so the archive closes the list instead of
interrupting it. The header folds and unfolds it; clicking a row reopens that
Session through `ctx.sessions.open`. Per-Session archiving is upstream's
right-click "Archive session" row action. Unarchive is a Desktop addition on
top of upstream's `unarchiveSession` verb: right-click an archived row for
"Move out of archive", or the Archived header for "Move all out of archive
(n)". A Workspace row's right-click menu also gains "Archive all sessions (n)",
which confirms before it archives. The group appears only in the grouped view,
matching the divider behaviour.

The state lives in `localStorage` under `dsh.desktop.workspace-decor.v1`. It is
per-machine and never leaves the renderer, which is the honest fit for what it
is: a local view preference, not Workspace data the Host should own.

This one decorates a surface upstream renders. `sidebar.workspaces` is a
single-occupant slot filled by `ui-workspace`'s Workspace browser, and it
declares no per-row seam, so the only alternatives were taking the slot over
(re-implementing that browser's entire injected surface to recolour an icon) or
decorating the rendered DOM. It decorates the DOM, the same way find-in-chat
reaches into the transcript. Read the anchors section before touching it.

### Text files into the composer

Dropping or pasting a `.md` file onto the chat window stages it as a compact
tile above the composer. The tile names the file and its size, and carries a
remove control. The file's text joins the message when it is sent, fenced and
labelled with the filename, ahead of whatever was typed. Several files at once
each get their own tile and their own block.

With no current Session there is no dock to render tiles into, so a drop there
falls back to pasting the text straight into the draft. A staged file behind an
unmounted rail would be invisible, which is worse than a noisy composer.

The rail claims both send gestures while it holds files: Enter in the composer,
and a click on the submit control. Enter is the reliable path. The submit
control carries no stable attribute and its label is localized, so it is found
structurally as the last enabled button in the composer card. If upstream ever
reorders that row the click path stops matching, the message sends without the
files, and the tiles stay on screen — visibly incomplete and recoverable with
Enter, rather than a silent drop.

Inlining is not a shortcut around the attachment pipeline, it is the only route
that exists. Upstream's composer attachments carry images only: the wire form
is `{ type: 'image', mediaType }` over a four-way union of PNG, JPEG, WebP and
GIF (`ui-conversation`, `service.ts`), so there is no shape a Markdown file
could travel in. It has the useful side effect of working wherever the file
sits, including outside any Workspace the agent can read.

Drops are claimed only when every file in them is text. A mixed drop stays with
upstream, because claiming it would mean stopping the event and taking the
images down with it.

## Install by hand

Skip this section unless the installer stopped on a missing anchor. These are
the same steps it performs.

### 1. Copy the folder

Copy `files/client/desktop-extras/` into `dsh-plugin-desktop/src/client/`.
Twenty-six source files, no dependencies beyond React and the packages the client
plugin already uses.

### 2. Wire it into the client plugin

Three edits to `dsh-plugin-desktop/src/client/index.ts`.

Add the import next to the other feature imports:

```ts
import { applyDesktopExtras } from './desktop-extras/index.ts'
```

Add the re-export next to `applyDesktopSettings`:

```ts
export {
  applyDesktopExtras,
  applyFindInChat,
  applyPreferencesShortcut,
  applyTextDrop,
  applyWorkspaceDecor,
  FIND_IN_CHAT_BINDING,
  PREFERENCES_BINDINGS,
} from './desktop-extras/index.ts'
```

Call it inside `apply`, after `applyThinkingToggle(ctx)` and before the
mode-specific shell calls:

```ts
applyDesktopExtras(ctx)
```

Position matters only in that it must come before the `if (environment.mode
=== ...)` branches, so the registration happens for every presentation mode.

### 3. Restore the tests

Copy every spec in `files/tests/` into `dsh-plugin-desktop/tests/` and add each
to the `include` array in `tsconfig.tests.client.json`:

```json
"tests/client-desktop-extras.spec.ts",
"tests/client-workspace-decor.spec.ts",
"tests/client-decor-paint.spec.ts",
"tests/client-archive-model.spec.ts",
"tests/client-archive-paint.spec.ts",
"tests/client-text-drop-styles.spec.ts",
```

That tsconfig lists client test files one by one, so an unlisted spec is
silently excluded from `yarn typecheck`.

### 4. Check the thinking pill survived

These four files should still be present in `dsh-plugin-desktop/src/client/`:

- `ThinkingToggle.tsx`
- `thinking-toggle.ts`
- `thinking-toggle-locales.ts`
- `thinking-toggle-styles.ts`

And `apply` in `index.ts` should still call `applyThinkingToggle(ctx)`, above
the `if (environment.mode === ...)` branches.

If a merge dropped them, copy them back from `files/client/thinking-toggle/`
into `src/client/` and restore both wiring lines:

```ts
import { applyThinkingToggle } from './thinking-toggle.ts'
```

```ts
applyThinkingToggle(ctx)
```

Prefer the kit copies over rewriting the feature. To compare against what was
committed before the merge:

```bash
git log --oneline --all -- dsh-plugin-desktop/src/client/thinking-toggle.ts
```

## Verify

```bash
corepack yarn workspace dsh-plugin-desktop typecheck
```

```bash
corepack yarn workspace dsh-plugin-desktop test
```

Both must pass clean. The test suite is the real gate here: the extras reach
the plugin entry, so a broken import chain fails suites that have nothing to do
with this feature.

Then check by hand in a running app. The decision logic is unit tested, but
every DOM half of every feature is not, so these are the checks that matter:

- Option+F opens the find bar over the conversation. Typing highlights matches,
  Enter and Shift+Enter step through them, Escape closes.
- Cmd+, opens the settings panel.
- The thinking pill sits left of the model seat and flips reasoning effort.
- Right-clicking a sidebar Workspace row opens the colour menu. Picking a
  colour tints that folder icon and survives a reload. Picking the outlined
  default swatch clears it.
- "Add divider above" puts a labelled rule above that Workspace. Right-clicking
  the divider renames or removes it. Renaming the Workspace keeps both.
- Archiving a Session with its right-click "Archive session" action moves it
  into an "Archived (n)" group at the bottom of the grouped tree, below
  Ungrouped. Clicking a row reopens the Session; the header folds the rows.
  Right-clicking an archived row offers "Move out of archive"; right-clicking
  the Archived header offers "Move all out of archive (n)". Right-clicking a
  Workspace row offers "Archive all sessions (n)", which confirms before it
  acts. Archiving, restoring, and reopening survive a reload.
- Dragging a `.md` file onto the chat stages it as a tile above the composer.
  The rail is centred on the composer card and its first tile lines up with the
  draft text, not with the left edge of the conversation column.
  Sending with Enter delivers the file text ahead of what was typed; sending
  with the submit button does the same. The remove control clears the tile.
- Dragging a PNG still attaches it as an image.

That last pair is the one worth doing carefully. The drop handler runs in the
capture phase ahead of upstream's, so a bug there could swallow image drops
rather than merely failing to inline text.

## Reading the running app

Every DOM assumption in this kit must be confirmed against a running app, not
against the repo. Two of them were wrong for two build cycles because the
submodule's built bundle disagrees with what actually ships.

The renderer answers the Chrome DevTools Protocol. Quit the app, relaunch it
with the flag, and evaluate against the real page:

```bash
open -a "/Applications/DSH Desktop.app" --args --remote-debugging-port=9222
```

```bash
curl -s http://127.0.0.1:9222/json | head -c 400
```

That lists the renderer target and its `webSocketDebuggerUrl`. Connect to it
with the `ws` package already in `dsh-plugin-desktop/node_modules` and send one
`Runtime.evaluate`. A probe worth keeping to hand:

```js
const region = document.querySelector('[data-slot="sidebar.workspaces"]')
const rows = region.querySelectorAll('[role="treeitem"][aria-expanded]')
JSON.stringify({ region: region !== null, rows: rows.length })
```

Note the flag goes to the packaged app through `open --args`, where Electron
parses it before the app's own CLI does. It does not work in a dev run: `node
lib/bin.js` puts the Desktop CLI parser first, and it rejects the unknown
option with a usage message.

The app's own web port (`lsof -nP -iTCP -sTCP:LISTEN` against the app) is not a
way in. It answers `forbidden` without the renderer's header token.

Injecting a change through the same channel is the cheapest way to test a DOM
idea, because it costs seconds rather than a twenty-minute package. Colour a
glyph, insert an element, and look. A reload undoes it.

## Run the new code

Two apps can exist on one machine, and they are easy to confuse.

1. The installed app in `/Applications/DSH Desktop.app`. It carries whatever
   was packaged into it, which is not what you just built.
2. The build in this repo, under `dsh-plugin-desktop/lib/`.

`yarn build` only updates the second one. The installed app never reads the
repo, so nothing you build here shows up in it until you package and install.

To confirm which one holds the features, count them in each bundle. Zero means
that app does not have them:

```bash
grep -c dshFindInChat "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/lib/client.js"
```

```bash
grep -c dshFindInChat dsh-plugin-desktop/lib/client.js
```

`dshFindInChat` only proves find-in-chat is present. The features arrived in
separate merges, so a bundle can carry one and not another. To check all of
them at once:

```bash
for m in dshFindInChat dshWsMenu data-dsh-folder data-composer-input; do printf "%-24s %s\n" "$m" "$(grep -c -- "$m" dsh-plugin-desktop/lib/client.js)"; done
```

### Quick test, no install

Quit the installed app first. The app takes a single-instance lock
(`main.ts`, `requestSingleInstanceLock`), so launching a second copy while one
runs just wakes the running one and your new build never starts. This is the
most common way to conclude, wrongly, that a change did not work.

```bash
osascript -e 'quit app "DSH Desktop"'
```

```bash
corepack yarn dev
```

That runs the repo build. It leaves `/Applications` alone.

### Real install

Build an unsigned universal DMG. This runs the full package gate first, so
give it time:

```bash
corepack yarn workspace dsh-plugin-desktop dist:mac-smoke
```

The DMG lands in `dsh-plugin-desktop/dist/mac-smoke/`, named for the version in
`dsh-plugin-desktop/package.json`. At 2.0.4 that is
`DSH Desktop-2.0.4-universal.dmg`. Check the directory for the current name.

Signing and notarization are release-only steps on a credentialed machine
(`dist:mac`). This artifact is unsigned, which is fine for your own machine.

Before trusting it, confirm the build actually carries the features. Zero here
means something went wrong and installing it would waste a reinstall:

```bash
hdiutil attach "dsh-plugin-desktop/dist/mac-smoke/DSH Desktop-2.0.4-universal.dmg" -readonly -nobrowse -mountpoint /tmp/dshdmg
```

```bash
grep -c dshFindInChat "/tmp/dshdmg/DSH Desktop.app/Contents/Resources/app.asar.unpacked/lib/client.js"
```

Mount at a fixed `-mountpoint` rather than reading `/Volumes`. The volume name
carries the version (`/Volumes/DSH Desktop 2.0.4-universal`), so a path written
against one release breaks on the next.

Now quit the app and swap it. Move the old copy to the Trash rather than
deleting it, so a bad build is one drag away from being undone:

```bash
osascript -e 'quit app "DSH Desktop"'
```

```bash
mv "/Applications/DSH Desktop.app" ~/.Trash/"DSH Desktop.app.old-$(date +%Y%m%d-%H%M%S)"
```

```bash
cp -R "/tmp/dshdmg/DSH Desktop.app" /Applications/
```

```bash
hdiutil detach /tmp/dshdmg
```

Open the app and check the behaviours listed under Verify.

If macOS refuses to open it because it is unsigned, clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/DSH Desktop.app"
```

## Upstream contracts this rides on

Eight upstream anchors hold the kit up. If a feature stops working after an
update, check these first, in this order.

The first four are shared or belong to find-in-chat and Preferences. The last
four belong to the sidebar decoration and the composer drop, and are listed in
their own section below because two of them are weaker than the rest.

**`[data-slot="<key>"]`** wraps every slot render site. The renderer calls this
its anchor contract and documents it in
`deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx`.
Find-in-chat uses `[data-slot="conversation"]` to bound the search, and the
Preferences shortcut uses `[data-slot="sidebar.settings"]` to locate the
trigger.

**`shell.overlay`** is a root-scoped list slot for frame-wide overlays,
rendered by the upstream `AppFrame` in compatibility mode and by the
Desktop-owned frames otherwise. One registration covers all three modes.

**`[data-chat-anchor-key]`** marks each transcript row. `ui-chat` puts it there
for its own scroll anchoring, so it names exactly the rows worth searching.

**`aria-haspopup="dialog"`** on the settings trigger, inside `SettingsRoot` in
`ui-settings-general`. The panel's open state is component-local React state
with no service behind it, so clicking the trigger is the only way in from
outside. If upstream ever exposes a settings service, switch to it and delete
`settingsTrigger()`.

`SETTINGS_TRIGGER_SELECTOR` is asserted in the test file, so a change to that
string is at least visible in the diff. The others fail silently, which is why
the manual check above matters.

### Anchors for the sidebar decoration and the composer drop

**`role="tree"`, `role="treeitem"`, and `aria-expanded`** locate the rows.
Upstream renders the browser as a real ARIA tree, and `aria-expanded` is the
discriminator between the two kinds of row: Workspace headers carry it because
they fold, Session rows do not because they do not.

Do not reach for class names here, however tempting. The first cut of this
feature used `.projectRow` and `.groupSection`, on the evidence that the
submodule's built bundle carries them unhashed. That evidence was from a stale
artifact. The packaged client hashes every CSS-module class, per module, with a
build-specific prefix: the same row ships as `_94NKXq_projectRow` in one build
and something else in the next. Selectors written against the plain names match
nothing in a real app, and the mistake is invisible from the repo, because the
stale bundle keeps saying otherwise. Confirm against a running app, never
against `deepseek-harness/packages/client/*/lib/`.

The same applies to the folder colour, which is why it is written inline onto
the glyph elements by `workspace-decor-paint.ts` rather than declared as a CSS
rule. There is no stable class for a rule to name.

**Row structure: icons first, then the title.** A header row's leading children
are icon holders (the folder, then the chevron that replaces it on hover), and
the first child carrying text is the title. `glyphSpans` takes children while
they hold graphics and no text, which stops at the title and so never reaches
the trailing action buttons, which also hold graphics.

**A row's section is its ancestor that is a direct child of the tree.** The
depth is not fixed: a Workspace row is wrapped in a hover card and sits two
levels down, while the Ungrouped bucket has no hover card and sits one level
down. `sectionOf` walks up to the tree rather than assuming either.

**Group sections render in Workspace-list order, Ungrouped last.**
`groupByWorkspace` in `ui-workspace/src/client/tree.ts` pushes one section per
Workspace unconditionally and in order, then appends the Ungrouped bucket only
when loose Sessions exist. That is what lets `identifyWorkspaceRows` pair rows
with Workspace ids by position, and there is nothing else in the DOM to pair
on: the rows carry no Workspace id. It also means the counts match by
construction, since nothing filters the list.

The guard against that changing is a length check. Anything other than an exact
match, or exactly one extra row for the bucket, pairs nothing at all rather
than pairing partially. `client-workspace-decor.spec.ts` covers it.

**`useWorkspaces`** is a global standard prop, merged into `GlobalStandardProps`
by `ui-workspace` and delivered to every slot component. It is what supplies
the Workspace ids that the DOM does not carry. This one is a real declared
contract, and a typed one, so it fails at the typecheck rather than silently.

**`data-composer-input`** marks the composer's contenteditable host, set by
`ComposerContentEditable` in `ui-conversation`. Text insertion goes through a
synthetic `paste` event dispatched at that element: the composer binds a Lexical
editor registered with `@lexical/plain-text`, which owns PASTE_COMMAND, so a
dispatched paste lands the text at the caret and inside Lexical's own undo
history. Writing to the DOM directly would be reverted on the next reconcile.

`COMPOSER_SELECTOR` is exported, so a change to that string is visible in the
diff the same way the settings trigger is.

**`--dsh-composer-card-max-width` and `--dsh-composer-side-clearance`** size the
tile rail. `conversation.input.dock` renders as a plain flex child of upstream's
`.composerStack`, which spans the whole conversation column, while the input
card centres itself and stops at that max width. A rail that only says
`width: 100%` therefore lands hard against the left edge of the column instead
of above the input, which is exactly what shipped in the 22:50 build. Both
variables are declared on the conversation root by `ui-conversation` and inherit
down, and upstream's own dock entries (`QueueDock`, `TodoPanel`) re-centre
themselves against the same pair, so this follows their convention rather than
inventing one.

Custom properties are safe to read where class names are not: they are named by
the stylesheet author and survive the CSS-module hashing that mangles every
class. Both reads still carry a fallback, because an unset custom property
inside a `calc` is invalid at computed-value time, which would collapse the
rail's width rather than merely misplace it. `client-text-drop-styles.spec.ts`
asserts the centring, the cap, and the fallbacks.

**`ComposerAttachments`' window-level `dragend` reset** closes upstream's drop
overlay unconditionally, and the drop handler here leans on it (see Known
limits). If upstream ever makes that listener inspect its event, or drops it,
the overlay sticks open after a text-file drop. That is the failure to look for
if drops start leaving a dimmed screen behind.

## Known limits

Find only searches loaded turns. The transcript pages older messages in on
demand, and what has not been fetched is not in the DOM to be found. Scroll up
to load more, then search again.

Matches inside a collapsed disclosure are skipped. They lay out no boxes, so
stepping onto one would scroll nowhere and highlight nothing.

Highlighting needs the CSS Custom Highlight API. Electron 43 ships it. On a
runtime without it the panel still counts and steps through matches, it just
paints nothing.

The Preferences chord is renderer-side, not a native macOS menu item, so it
does not appear in the application menu. That menu is built renderer-free from
trusted native tray contributions in `electron-runtime.ts`, and adding an item
would mean new main-to-renderer plumbing for a shortcut the renderer already
serves. `preferences-shortcut.ts` records the same reasoning.

Colours and dividers are per-machine. They live in `localStorage`, so they do
not follow the account to another install, and clearing site data clears them.

Dividers show only in the grouped sidebar view. Switching to "In one list" or
running a search renders no Workspace rows at all, so there is nothing to hang
them on; they come back with the grouped tree. The Ungrouped bucket takes
neither a colour nor a divider, because it has no Workspace behind it.

The archived group has the same grouped-view limit. It is a view of the
registry-global archive set, which is durable; it is not per-machine state the
way colours and dividers are.

Unarchive returns a Session to the Workspace that still accounts it, never to a
different folder, because a Session's Workspace is its working directory and
there is no cross-Workspace move. Bulk archive and restore run one Session at a
time and stop on the first failure, so a failed run leaves a known prefix done.

Dividers cannot be dragged. Moving one means removing it and adding it above
the Workspace you want, which is two right-clicks.

Dragging a text file shows no drop overlay. The drag is claimed from its first
event so upstream's image overlay never opens, and no Desktop-owned overlay
replaces it. The text appearing in the composer is the whole feedback.

That claim is best-effort, because drag events expose MIME types but never
filenames, and platforms report `.md` inconsistently: `text/markdown`,
`text/plain`, or nothing at all. When a platform reports nothing, upstream's
overlay does open during the drag, and the drop still inlines the file, because
by then the filename is readable.

That second path is why the drop handler raises a `dragend` on the window.
Upstream closes its overlay from its own drop handler, which the capture-phase
claim has just stopped, and nothing else would close it: `dragend` does not
fire for a drag that began outside the document, and no `dragleave` follows a
drop. Upstream's window-level `dragend` listener is a bare reset, so raising
one closes the overlay through upstream's own path. Removing that line strands
the overlay on screen.

Files over 256 KB are cut at the cap with a visible `[truncated: ...]` marker
inside the fence. The marker is deliberately in the draft rather than in a
toast, so it is seen and can be edited before sending.

The truncation marker is English in every locale. It is prompt text rather than
interface copy, and the composer's contents are not otherwise localized.

## Keeping the kit current

A reinstall copies from `files/`, so editing the live source in
`dsh-plugin-desktop` without refreshing the kit means the next reinstall
silently reverts the edit. After changing any file the kit owns:

```bash
node .agents/kits/dsh-desktop-extras/sync-from-repo.mjs
```

`--check` reports drift and exits non-zero without writing, if you ever want it
in a pre-commit hook.

## File map

Source files, under `files/client/desktop-extras/`.

| File | Role |
| --- | --- |
| `index.ts` | `applyDesktopExtras`, the single entry point |
| `keybindings.ts` | both chords as data, plus the `code`-based matcher |
| `find-in-chat.ts` | slot and locale registration for the find bar |
| `FindInChat.tsx` | the panel, its shortcut listener, and its open state |
| `find-in-chat-locales.ts` | English and Chinese copy |
| `find-in-chat-styles.ts` | panel CSS and the two `::highlight()` rules |
| `transcript-index.ts` | DOM-free search core, whitespace and case folding |
| `transcript-search.ts` | DOM scan, Range mapping, highlight painting |
| `preferences-shortcut.ts` | the Cmd+, listener and the trigger selector |
| `workspace-decor.ts` | slot and locale registration for the sidebar decoration |
| `WorkspaceDecor.tsx` | decoration state, the sidebar observer, and the right-click menu |
| `workspace-decor-store.ts` | DOM-free model: palette, colours, dividers, persistence |
| `workspace-decor-locales.ts` | English and Chinese copy, colour names included |
| `workspace-decor-styles.ts` | the folder-colour override, divider rule, menu CSS |
| `sidebar-workspace-rows.ts` | DOM read: find rows, pair them with Workspace ids |
| `workspace-decor-paint.ts` | DOM write: colours on, dividers reconciled, full cleanup |
| `archive-model.ts` | DOM-free: which archived Sessions the group shows, in order |
| `archive-paint.ts` | DOM write: the archived group reconciled, foldable, fully removable |
| `archive-styles.ts` | archived-group header and row CSS |
| `text-drop.ts` | capture-phase drop/paste claim and the synthetic paste |
| `text-drop-model.ts` | DOM-free: which files qualify, fencing, the size cap |
| `text-drop-store.ts` | DOM-free staging seam between the drop handler and the tiles |
| `text-drop-tiles.ts` | dock-slot and locale registration for the tile rail |
| `TextDropTiles.tsx` | the tile rail, and the send gestures it claims while staged |
| `text-drop-locales.ts` | English and Chinese tile copy |
| `text-drop-styles.ts` | tile CSS, including the rail's alignment to the composer card |

Each of the two newer features splits the same way, on purpose: a DOM-free
module holding every decision, and a thin DOM module holding none. The suite
runs in a node environment, so that split is what makes them testable at all.

The rest of the kit.

| Path | Role |
| --- | --- |
| `README.md` | the short version: reinstall, verify, sync |
| `install.mjs` | the installer, idempotent, `--check` for a dry run |
| `sync-from-repo.mjs` | copies live source back into the kit |
| `files/client/thinking-toggle/` | the four thinking pill files, restored only when missing |
| `files/tests/` | the six specs covering the extras; `install.mjs` lists each one in `tsconfig.tests.client.json` for you |

`sync-from-repo.mjs` walks the kit and not the repo, so a brand new source file
has to be copied in by hand once before it will track. The installer walks the
kit's directories, so once a file is in, it installs and syncs with no further
edits.
