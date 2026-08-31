/**
 * Reinstall the Desktop extras into a checkout of dsh-desktop.
 *
 * Copies the kit's source files into dsh-plugin-desktop and re-applies the few
 * wiring lines they need. Every step is idempotent, so running it on a tree
 * that already has the extras reports "already wired" and changes nothing.
 *
 *   node install.mjs              install into the repo this kit sits in
 *   node install.mjs --check      report what would change, write nothing
 *   node install.mjs --repo PATH  install into a checkout somewhere else
 *
 * Exits non-zero when an anchor line is missing, which is the signal that an
 * upstream merge moved the code this kit patches. The message names the file
 * and the line to add by hand.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const repoFlag = args.indexOf('--repo')
const REPO = repoFlag >= 0 && args[repoFlag + 1] !== undefined
  ? resolve(args[repoFlag + 1])
  // The kit lives at <repo>/.agents/kits/dsh-desktop-extras.
  : resolve(KIT, '..', '..', '..')

const PACKAGE = join(REPO, 'dsh-plugin-desktop')
const CLIENT = join(PACKAGE, 'src', 'client')
const EXTRAS = join(CLIENT, 'desktop-extras')
const TESTS = join(PACKAGE, 'tests')
const ENTRY = join(CLIENT, 'index.ts')
const TESTS_TSCONFIG = join(PACKAGE, 'tsconfig.tests.client.json')

const changed = []
const skipped = []
const problems = []

/** Report and stop, leaving whatever has already been written in place. */
function fail(message) {
  process.stderr.write(`install: ${message}\n`)
  process.exit(1)
}

/** Copy one file, recording whether it actually differs from the target. */
function place(from, to) {
  const source = readFileSync(from, 'utf8')
  if (existsSync(to) && readFileSync(to, 'utf8') === source) {
    skipped.push(`${to.slice(REPO.length + 1)} (identical)`)
    return
  }
  changed.push(to.slice(REPO.length + 1))
  if (checkOnly) return
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}

/**
 * Insert `insertion` next to the line matching `anchor`, unless `marker` is
 * already somewhere in the file.
 * @param where - 'after' or 'before' the anchor line.
 */
function ensure(text, { file, marker, anchor, insertion, label, where = 'after' }) {
  if (text.includes(marker)) {
    skipped.push(`${file}: ${label} (already wired)`)
    return text
  }
  const at = text.indexOf(anchor)
  if (at < 0) {
    problems.push(
      `${file}: could not find the anchor line\n`
      + `      ${anchor.trim()}\n`
      + `    An upstream merge probably moved it. Add this by hand:\n`
      + insertion.split('\n').map(line => `      ${line}`).join('\n'),
    )
    return text
  }
  changed.push(`${file}: ${label}`)
  if (where === 'before') return `${text.slice(0, at)}${insertion}\n${text.slice(at)}`
  const end = at + anchor.length
  return `${text.slice(0, end)}\n${insertion}${text.slice(end)}`
}

/** Insert after the anchor line. */
const ensureAfter = (text, options) => ensure(text, { ...options, where: 'after' })

/** Insert before the anchor line, for a call that must run ahead of it. */
const ensureBefore = (text, options) => ensure(text, { ...options, where: 'before' })

if (!existsSync(join(PACKAGE, 'package.json'))) {
  fail(`no dsh-plugin-desktop under ${REPO}. Pass --repo with the checkout path.`)
}

// 1. The extras themselves.
const extrasSource = join(KIT, 'files', 'client', 'desktop-extras')
for (const name of readdirSync(extrasSource)) {
  place(join(extrasSource, name), join(EXTRAS, name))
}

// 2. The thinking toggle. It predates this kit and lives flat in src/client,
//    so it is only restored when a merge has actually dropped it; an existing
//    copy is left alone rather than overwritten.
const toggleSource = join(KIT, 'files', 'client', 'thinking-toggle')
for (const name of readdirSync(toggleSource)) {
  const target = join(CLIENT, name)
  if (existsSync(target)) {
    skipped.push(`src/client/${name} (present, left alone)`)
    continue
  }
  changed.push(`src/client/${name} (restored)`)
  if (!checkOnly) copyFileSync(join(toggleSource, name), target)
}

// 3. The test spec.
place(join(KIT, 'files', 'tests', 'client-desktop-extras.spec.ts'),
  join(TESTS, 'client-desktop-extras.spec.ts'))

// 4. Wiring in the client plugin entry.
if (!existsSync(ENTRY)) fail(`missing ${ENTRY}`)
let entry = readFileSync(ENTRY, 'utf8')

entry = ensureAfter(entry, {
  file: 'src/client/index.ts',
  label: 'import',
  marker: `import { applyDesktopExtras } from './desktop-extras/index.ts'`,
  anchor: `import { applyDesktopSettings } from './desktop-settings.ts'`,
  insertion: `import { applyDesktopExtras } from './desktop-extras/index.ts'`,
})

entry = ensureAfter(entry, {
  file: 'src/client/index.ts',
  label: 're-export',
  marker: `export {\n  applyDesktopExtras,`,
  anchor: `export { applyDesktopSettings } from './desktop-settings.ts'`,
  insertion: `export {
  applyDesktopExtras,
  applyFindInChat,
  applyPreferencesShortcut,
  FIND_IN_CHAT_BINDING,
  PREFERENCES_BINDINGS,
} from './desktop-extras/index.ts'`,
})

// The toggle call is the anchor for the extras call, so restore it first when
// a merge dropped it along with the toggle's files.
if (!entry.includes('applyThinkingToggle')) {
  entry = ensureAfter(entry, {
    file: 'src/client/index.ts',
    label: 'thinking toggle import',
    marker: `import { applyThinkingToggle }`,
    anchor: `import { applyExtendedShell, applyFramedShell } from './extended-shell.ts'`,
    insertion: `import { applyThinkingToggle } from './thinking-toggle.ts'`,
  })
  // Before the branch, not after it: the registrations must run for every
  // presentation mode, and reading them below a mode test invites the next
  // person to move them inside it.
  entry = ensureBefore(entry, {
    file: 'src/client/index.ts',
    label: 'thinking toggle call',
    marker: `applyThinkingToggle(ctx)`,
    anchor: `  if (environment.mode === 'advanced') applyAdvancedShell(ctx, environment)`,
    insertion: `  applyThinkingToggle(ctx)`,
  })
}

entry = ensureAfter(entry, {
  file: 'src/client/index.ts',
  label: 'apply call',
  marker: `applyDesktopExtras(ctx)`,
  anchor: `  applyThinkingToggle(ctx)`,
  insertion: `  applyDesktopExtras(ctx)`,
})

// The entry is written as a whole or not at all. A half-wired entry compiles
// into something worse than an untouched one, so a missing anchor leaves the
// original in place and the report must not claim otherwise.
if (problems.length > 0) {
  for (let i = changed.length - 1; i >= 0; i -= 1) {
    if (changed[i]?.startsWith('src/client/index.ts:') === true) changed.splice(i, 1)
  }
  skipped.push('src/client/index.ts (left untouched, see the anchor failures below)')
} else if (!checkOnly) {
  writeFileSync(ENTRY, entry)
}

// 5. The test tsconfig lists client specs one by one, so an unlisted spec is
//    silently dropped from `yarn typecheck`.
if (!existsSync(TESTS_TSCONFIG)) fail(`missing ${TESTS_TSCONFIG}`)
let tsconfig = readFileSync(TESTS_TSCONFIG, 'utf8')
const SPEC_ENTRY = `"tests/client-desktop-extras.spec.ts",`
if (tsconfig.includes(SPEC_ENTRY)) {
  skipped.push('tsconfig.tests.client.json (already listed)')
} else {
  const anchor = `"tests/client-desktop-settings.spec.ts",`
  if (!tsconfig.includes(anchor)) {
    problems.push(
      `tsconfig.tests.client.json: could not find the anchor entry ${anchor}\n`
      + `    Add ${SPEC_ENTRY} to the "include" array by hand.`,
    )
  } else {
    changed.push('tsconfig.tests.client.json: include entry')
    tsconfig = tsconfig.replace(anchor, `${SPEC_ENTRY}\n    ${anchor}`)
    if (!checkOnly) writeFileSync(TESTS_TSCONFIG, tsconfig)
  }
}

// Report.
const mode = checkOnly ? 'would change' : 'changed'
process.stdout.write(`\nDesktop extras install into ${REPO}\n\n`)
if (changed.length === 0) process.stdout.write(`  nothing to do, everything is in place\n`)
for (const item of changed) process.stdout.write(`  ${mode}: ${item}\n`)
for (const item of skipped) process.stdout.write(`  skipped: ${item}\n`)

if (problems.length > 0) {
  process.stdout.write(`\n${problems.length} anchor(s) could not be applied:\n\n`)
  for (const item of problems) process.stdout.write(`  - ${item}\n\n`)
  process.stdout.write(`Fix those by hand, then run this again to confirm.\n`)
  process.exit(1)
}

if (!checkOnly && changed.length > 0) {
  process.stdout.write(`
Next, from the repo root:

  corepack yarn workspace dsh-plugin-desktop typecheck
  corepack yarn workspace dsh-plugin-desktop test

Then launch the dev build to see it:

  corepack yarn dev
`)
}
