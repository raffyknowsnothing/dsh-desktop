/**
 * Refresh the kit from the live source in dsh-plugin-desktop.
 *
 * The kit is the source of truth for reinstalling, so after editing any of
 * these files in the repo, run this to copy the new versions back in.
 * Otherwise the next reinstall quietly reverts your work.
 *
 *   node sync-from-repo.mjs           copy live source into the kit
 *   node sync-from-repo.mjs --check   report drift, write nothing
 *
 * Exits non-zero under --check when the kit and the repo disagree, so it can
 * be wired into a pre-commit hook if the drift ever bites.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const checkOnly = process.argv.slice(2).includes('--check')
const REPO = resolve(KIT, '..', '..', '..')
const PACKAGE = join(REPO, 'dsh-plugin-desktop')

/** Kit directory paired with the live directory it mirrors. */
const PAIRS = [
  { kit: join(KIT, 'files', 'client', 'desktop-extras'), live: join(PACKAGE, 'src', 'client', 'desktop-extras') },
  { kit: join(KIT, 'files', 'client', 'thinking-toggle'), live: join(PACKAGE, 'src', 'client') },
  { kit: join(KIT, 'files', 'tests'), live: join(PACKAGE, 'tests') },
]

const drifted = []
const missing = []

for (const pair of PAIRS) {
  for (const name of readdirSync(pair.kit)) {
    const live = join(pair.live, name)
    const kit = join(pair.kit, name)
    if (!existsSync(live)) {
      missing.push(`${name} is in the kit but not in the repo`)
      continue
    }
    if (readFileSync(live, 'utf8') === readFileSync(kit, 'utf8')) continue
    drifted.push(name)
    if (!checkOnly) copyFileSync(live, kit)
  }
}

if (missing.length > 0) {
  process.stdout.write(`\n${missing.length} file(s) the repo no longer has:\n`)
  for (const item of missing) process.stdout.write(`  ${item}\n`)
  process.stdout.write(`\nThe kit copy is kept. Delete it by hand if the file is genuinely gone.\n`)
}

if (drifted.length === 0) {
  process.stdout.write(`\nkit is in sync with ${PACKAGE.slice(REPO.length + 1)}\n`)
  process.exit(missing.length > 0 ? 1 : 0)
}

process.stdout.write(`\n${drifted.length} file(s) ${checkOnly ? 'have drifted' : 'copied into the kit'}:\n`)
for (const item of drifted) process.stdout.write(`  ${item}\n`)
if (checkOnly) {
  process.stdout.write(`\nRun without --check to bring the kit up to date.\n`)
  process.exit(1)
}
