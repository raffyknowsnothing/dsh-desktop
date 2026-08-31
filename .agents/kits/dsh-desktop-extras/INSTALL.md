# Desktop extras install kit

Three Desktop-owned client affordances, packaged so they can be reapplied to a
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

Cmd+F stays with the surrounding app, which is why find uses Option+F. Change
either chord in `keybindings.ts`; both are declared as data at the top of that
file and nothing else hardcodes a key.

The thinking pill predates this kit and lives flat in `src/client/` rather than
in a folder of its own. `files/client/thinking-toggle/` carries a copy anyway,
and the installer restores it only when a merge has actually dropped it. An
existing copy is left alone.

## Install by hand

Skip this section unless the installer stopped on a missing anchor. These are
the same steps it performs.

### 1. Copy the folder

Copy `files/client/desktop-extras/` into `dsh-plugin-desktop/src/client/`. Nine
source files, no dependencies beyond React and the packages the client plugin
already uses.

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

Copy `files/tests/client-desktop-extras.spec.ts` into `dsh-plugin-desktop/tests/`
and add it to the `include` array in `tsconfig.tests.client.json`:

```json
"tests/client-desktop-extras.spec.ts",
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

Then check by hand in a running app, since none of the three behaviours are
covered by an automated end-to-end test:

- Option+F opens the find bar over the conversation. Typing highlights matches,
  Enter and Shift+Enter step through them, Escape closes.
- Cmd+, opens the settings panel.
- The thinking pill sits left of the model seat and flips reasoning effort.

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

Open the app and check the three behaviours above.

If macOS refuses to open it because it is unsigned, clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine "/Applications/DSH Desktop.app"
```

## Upstream contracts this rides on

Four upstream anchors hold the kit up. If a feature stops working after an
update, check these first, in this order.

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

The rest of the kit.

| Path | Role |
| --- | --- |
| `README.md` | the short version: reinstall, verify, sync |
| `install.mjs` | the installer, idempotent, `--check` for a dry run |
| `sync-from-repo.mjs` | copies live source back into the kit |
| `files/client/thinking-toggle/` | the four thinking pill files, restored only when missing |
| `files/tests/` | `client-desktop-extras.spec.ts` |
