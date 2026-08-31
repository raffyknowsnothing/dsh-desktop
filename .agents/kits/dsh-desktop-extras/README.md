# Desktop extras kit

Reinstalls three Desktop-owned client features after the repo is overwritten or
merged from `master`. Pristine copies of every file live in `files/`, so this
directory is enough on its own.

| Feature | Binding |
| --- | --- |
| Find in chat | Option+F |
| Preferences | Cmd+, on macOS, Ctrl+, elsewhere |
| Thinking mode pill | composer toggle, no chord |

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
| `files/client/desktop-extras/` | find in chat and the Preferences shortcut, nine source files |
| `files/client/thinking-toggle/` | the four thinking pill files, which live flat in `src/client/` |
| `files/tests/` | the unit test spec |

Read `INSTALL.md` before changing any of it. The features hang off four
undocumented-by-upstream anchors, and that file is where they are written down.
