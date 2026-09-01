/**
 * The staged-file rail's geometry contract.
 *
 * `conversation.input.dock` renders as a plain flex child of upstream's
 * `.composerStack`, which spans the whole conversation column. The composer
 * card below it centres itself and stops at `--dsh-composer-card-max-width`,
 * so a rail that does not do the same lands hard against the left edge of the
 * column instead of above the input. That is exactly what shipped, and no
 * behavioural test could have caught it: the rail rendered, staged correctly,
 * and sent correctly, in the wrong place.
 *
 * So this asserts the three declarations that put it back, against the
 * stylesheet text. A weak test for a weak failure mode, and the right shape
 * for it — the alternative is a layout engine.
 */
import { describe, expect, it } from 'vitest'
import { TEXT_DROP_CSS } from '../src/client/desktop-extras/text-drop-styles.ts'

/** The `.dshFileTiles` rule body, without the rules that follow it. */
function railRule(): string {
  const start = TEXT_DROP_CSS.indexOf('.dshFileTiles {')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = TEXT_DROP_CSS.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return TEXT_DROP_CSS.slice(start, end)
}

describe('staged-file rail geometry', () => {
  it('centres the rail rather than filling the conversation column', () => {
    expect(railRule()).toContain('margin: 0 auto')
  })

  it('caps the rail at the composer card width', () => {
    expect(railRule()).toContain('max-width: var(--dsh-composer-card-max-width')
  })

  it('insets the rail by the composer clearance on both sides', () => {
    const rule = railRule()
    expect(rule).toContain('--dsh-composer-side-clearance')
    // Both sides, so the centred box matches the card rather than overhanging
    // it by one clearance.
    expect(rule.split('--dsh-composer-side-clearance').length - 1).toBe(2)
  })

  it('gives every composer variable a fallback', () => {
    // An unset custom property inside a calc is invalid at computed-value
    // time, which collapses the width instead of merely misplacing the rail.
    for (const read of railRule().matchAll(/var\(--dsh-composer-[a-z-]+([^)]*)\)/g)) {
      expect(read[1]).toMatch(/^,\s*\S/)
    }
  })

  it('does not name an upstream CSS-module class', () => {
    // The packaged client hashes them per module and per build, so any such
    // rule matches nothing in the real app.
    for (const selector of TEXT_DROP_CSS.matchAll(/^\.([A-Za-z][\w-]*)/gm)) {
      expect(selector[1]).toMatch(/^dsh/)
    }
  })
})
