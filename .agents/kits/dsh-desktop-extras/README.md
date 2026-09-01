# Desktop extras kit

Reinstalls the Desktop-owned client features after the repo is overwritten or
merged from `master`. Pristine copies of every file live in `files/`, so this
directory is enough on its own.

| Feature | Binding |
| --- | --- |
| Find in chat | Option+F |
| Preferences | Cmd+, on macOS, Ctrl+, elsewhere |
| Thinking mode pill | composer toggle, no chord |
| Workspace folder colours and dividers | right-click a sidebar Workspace row |
| Archived session group | sidebar row in the grouped tree, click to reopen |
| Text files into the composer | drop or paste a `.md` file onto the chat |

## Reinstall

From the repo root:

```bash
node .agents/kits/dsh-desktop-extras/install.mjs
```

Then verify:

```bash
corepack yarn workspace dsh-plugin-desktop typecheck && corepack yarn workspace dsh-plugin-desktop test
```

The installer is idempotent, so running it on a tree that already has the
features reports "nothing to do" and writes nothing. To see what it would touch
without writing, add `--check`.

If an anchor line has moved, it stops, leaves `src/client/index.ts` untouched,
and prints the exact lines to add by hand. It never half-wires the entry.

## See it running

Quit the installed app first, or the single-instance lock wakes the old copy
and your build never starts:

```bash
osascript -e 'quit app "DSH Desktop"'
```

```bash
corepack yarn dev
```

That runs the repo build and leaves `/Applications` alone. To put the features
into the installed app for real, follow "Real install" in `INSTALL.md`.

## After editing the live source

The kit is what a reinstall copies from, so refresh it or your next reinstall
reverts your work:

```bash
node .agents/kits/dsh-desktop-extras/sync-from-repo.mjs
```

`--check` reports drift and exits non-zero without writing.

## Files

| Path | Role |
| --- | --- |
| `INSTALL.md` | the full account: what each feature does, the upstream contracts it rides on, known limits |
| `install.mjs` | the installer |
| `sync-from-repo.mjs` | copies live source back into the kit |
| `files/client/desktop-extras/` | the features `applyDesktopExtras` installs, twenty-six source files |
| `files/client/thinking-toggle/` | the four thinking pill files, which live flat in `src/client/` |
| `files/tests/` | the four unit test specs |

Read `INSTALL.md` before changing any of it. The features hang off a set of
undocumented-by-upstream anchors, and that file is where they are written down.

One rule matters more than the rest: **never anchor on a CSS class name, and
never trust `deepseek-harness/packages/client/*/lib/` for a question about the
rendered page.** The packaged client hashes every CSS-module class, per module
and per build, so `.projectRow` ships as `_94NKXq_projectRow` and changes again
next build. The submodule's built bundle still shows the plain names, which is
how that mistake got made here twice. Check a running app instead; `INSTALL.md`
has a section on how to read one over the DevTools protocol in seconds.
