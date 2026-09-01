/**
 * Idempotence cover for the sidebar divider painting.
 *
 * This exists because a placement bug here does not merely look wrong, it
 * freezes the window. The painter runs from a MutationObserver watching the
 * subtree the painter writes into, so any placement that is not perfectly
 * stable becomes an unbounded loop on the main thread. One shipped: two
 * dividers parked at the tail were each appended in turn, and every append
 * unseated the other.
 *
 * The suite runs in a node environment with no DOM, so the fake below is the
 * smallest tree that `paintDividers` actually touches. It counts structural
 * mutations, and the assertion that matters is that a second pass over a
 * settled tree performs zero.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { paintDividers } from '../src/client/desktop-extras/workspace-decor-paint.ts'
import { TAIL_ANCHOR, type WorkspaceDecorState } from '../src/client/desktop-extras/workspace-decor-store.ts'
import type { IdentifiedWorkspaceRow } from '../src/client/desktop-extras/sidebar-workspace-rows.ts'

/** Structural mutations performed across the whole fake tree. */
let mutations = 0

/** The subset of Element this painter uses. */
class FakeElement {
  readonly attributes = new Map<string, string>()
  readonly childNodes: FakeElement[] = []
  parentElement: FakeElement | null = null
  className = ''
  textContent = ''

  constructor(readonly tag: string) {}

  get children(): FakeElement[] { return this.childNodes }
  get firstElementChild(): FakeElement | null { return this.childNodes[0] ?? null }
  get lastElementChild(): FakeElement | null { return this.childNodes.at(-1) ?? null }

  get nextElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.childNodes
    if (siblings === undefined) return null
    return siblings[siblings.indexOf(this) + 1] ?? null
  }

  setAttribute(name: string, value: string): void { this.attributes.set(name, value) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  removeAttribute(name: string): void { this.attributes.delete(name) }

  appendChild(child: FakeElement): FakeElement {
    this.insertBefore(child, null)
    return child
  }

  insertBefore(child: FakeElement, before: FakeElement | null): FakeElement {
    mutations += 1
    child.remove()
    const at = before === null ? this.childNodes.length : this.childNodes.indexOf(before)
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child)
    child.parentElement = this
    return child
  }

  remove(): void {
    const siblings = this.parentElement?.childNodes
    if (siblings === undefined) return
    const at = siblings.indexOf(this)
    if (at >= 0) siblings.splice(at, 1)
    this.parentElement = null
  }

  /** Depth-first descendants, self excluded. */
  descendants(): FakeElement[] {
    return this.childNodes.flatMap(child => [child, ...child.descendants()])
  }

  /** Only the attribute-presence and attribute-equals forms the painter uses. */
  querySelectorAll(selector: string): FakeElement[] {
    const equals = /^\[([^\]=]+)="(.*)"\]$/.exec(selector)
    if (equals !== null) {
      return this.descendants().filter(node => node.getAttribute(equals[1] as string) === equals[2])
    }
    const present = /^\[([^\]]+)\]$/.exec(selector)
    if (present !== null) {
      return this.descendants().filter(node => node.getAttribute(present[1] as string) !== null)
    }
    return this.descendants().filter(node => node.className.split(' ').includes(selector.replace('.', '')))
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

const originalDocument = (globalThis as { document?: unknown }).document
const originalCSS = (globalThis as { CSS?: unknown }).CSS

beforeEach(() => {
  mutations = 0
  ;(globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => new FakeElement(tag),
  }
  ;(globalThis as { CSS?: unknown }).CSS = { escape: (value: string) => value }
})

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = originalDocument
  ;(globalThis as { CSS?: unknown }).CSS = originalCSS
})

/** A region holding one tree with `count` workspace sections. */
function buildRegion(count: number): { region: FakeElement; rows: IdentifiedWorkspaceRow[] } {
  const region = new FakeElement('div')
  const list = new FakeElement('div')
  region.appendChild(list)
  const rows: IdentifiedWorkspaceRow[] = []
  for (let index = 0; index < count; index += 1) {
    const section = new FakeElement('div')
    const row = new FakeElement('div')
    section.appendChild(row)
    list.appendChild(section)
    rows.push({
      section: section as unknown as HTMLElement,
      row: row as unknown as HTMLElement,
      label: `ws-${index}`,
      workspaceId: `ws-${index}`,
    })
  }
  return { region, rows }
}

/**
 * The list's children in order: dividers by their label, sections as
 * 'section'. The label lives on a child span, because this fake's
 * `textContent` is a plain field rather than an aggregate of descendants.
 */
function layout(region: FakeElement): string[] {
  const list = region.firstElementChild
  return (list?.children ?? []).map((child) => {
    if (child.getAttribute('data-dsh-divider-id') === null) return 'section'
    return child.querySelector('.dshWsDividerLabel')?.textContent ?? ''
  })
}

describe('divider painting is idempotent', () => {
  const paint = (region: FakeElement, rows: IdentifiedWorkspaceRow[], state: WorkspaceDecorState) => {
    paintDividers(region as unknown as HTMLElement, rows, state)
  }

  it('performs no mutations on a second pass with dividers above rows', () => {
    const { region, rows } = buildRegion(3)
    const state: WorkspaceDecorState = {
      colors: {},
      dividers: [
        { id: 'a', label: 'A', above: 'ws-0' },
        { id: 'b', label: 'B', above: 'ws-2' },
      ],
    }
    paint(region, rows, state)
    expect(layout(region)).toEqual(['A', 'section', 'section', 'B', 'section'])
    mutations = 0
    paint(region, rows, state)
    expect(mutations).toBe(0)
  })

  it('settles with two dividers parked at the tail', () => {
    // The freeze. Appending each in turn made the other no longer last, so
    // every pass moved one and dirtied the other, and the observer driving
    // these passes never stopped firing.
    const { region, rows } = buildRegion(2)
    const state: WorkspaceDecorState = {
      colors: {},
      dividers: [
        { id: 'a', label: 'A', above: TAIL_ANCHOR },
        { id: 'b', label: 'B', above: TAIL_ANCHOR },
      ],
    }
    paint(region, rows, state)
    expect(layout(region)).toEqual(['section', 'section', 'A', 'B'])
    for (let pass = 0; pass < 5; pass += 1) {
      mutations = 0
      paint(region, rows, state)
      expect(mutations).toBe(0)
    }
  })

  it('settles with tail and above dividers mixed', () => {
    const { region, rows } = buildRegion(3)
    const state: WorkspaceDecorState = {
      colors: {},
      dividers: [
        { id: 'a', label: 'A', above: 'ws-1' },
        { id: 'b', label: 'B', above: TAIL_ANCHOR },
        { id: 'c', label: 'C', above: TAIL_ANCHOR },
      ],
    }
    paint(region, rows, state)
    expect(layout(region)).toEqual(['section', 'A', 'section', 'section', 'B', 'C'])
    mutations = 0
    paint(region, rows, state)
    expect(mutations).toBe(0)
  })

  it('keeps tail dividers in their stored order', () => {
    const { region, rows } = buildRegion(1)
    const state: WorkspaceDecorState = {
      colors: {},
      dividers: [
        { id: 'x', label: 'X', above: TAIL_ANCHOR },
        { id: 'y', label: 'Y', above: TAIL_ANCHOR },
        { id: 'z', label: 'Z', above: TAIL_ANCHOR },
      ],
    }
    paint(region, rows, state)
    expect(layout(region)).toEqual(['section', 'X', 'Y', 'Z'])
    mutations = 0
    paint(region, rows, state)
    expect(mutations).toBe(0)
  })

  it('removes dividers the state no longer holds', () => {
    const { region, rows } = buildRegion(2)
    paint(region, rows, { colors: {}, dividers: [{ id: 'a', label: 'A', above: 'ws-0' }] })
    expect(layout(region)).toEqual(['A', 'section', 'section'])
    paint(region, rows, { colors: {}, dividers: [] })
    expect(layout(region)).toEqual(['section', 'section'])
  })

  it('renders nothing when no rows are on screen', () => {
    const { region } = buildRegion(0)
    paint(region, [], { colors: {}, dividers: [{ id: 'a', label: 'A', above: TAIL_ANCHOR }] })
    expect(layout(region)).toEqual([])
  })
})
