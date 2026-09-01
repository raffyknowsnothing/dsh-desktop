/**
 * Idempotence cover for the archived-group painter.
 *
 * The same discipline as the divider painter: this code runs from the
 * MutationObserver that watches the subtree it writes into, so any placement
 * that is not perfectly stable becomes an unbounded repaint loop on the main
 * thread. The assertion that matters is that a second pass over a settled tree
 * performs zero structural mutations.
 *
 * The suite runs in a node environment with no DOM, so the fake below is the
 * smallest tree the painter actually touches, and it counts structural
 * mutations exactly the way the divider spec does.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  ARCHIVE_HEADER_CLASS,
  ARCHIVE_ROW_ATTRIBUTE,
  ARCHIVE_SECTION_ATTRIBUTE,
  clearArchiveSection,
  paintArchiveSection,
} from '../src/client/desktop-extras/archive-paint.ts'
import type { ArchiveRow } from '../src/client/desktop-extras/archive-model.ts'

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
})

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = originalDocument
  ;(globalThis as { CSS?: unknown }).CSS = originalCSS
})

/** A grouped tree: two Workspace sections, then the Ungrouped bucket. */
function groupedTree(): FakeElement {
  const tree = new FakeElement('div')
  const a = new FakeElement('div')
  const b = new FakeElement('div')
  const bucket = new FakeElement('div')
  tree.appendChild(a)
  tree.appendChild(b)
  tree.appendChild(bucket)
  return tree
}

/** The fake stands in for HTMLElement; the painter only touches this subset. */
function el(node: FakeElement | null): HTMLElement {
  return node as unknown as HTMLElement
}

const rows: readonly ArchiveRow[] = [
  { id: 's1', label: 'First chat' },
  { id: 's2', label: 'Sound design notes' },
]

describe('paintArchiveSection', () => {
  it('places the group above the Ungrouped bucket', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    expect(section).not.toBeNull()
    expect(section?.nextElementSibling).toBe(bucket)
  })

  it('appends at the end when there is no bucket', () => {
    const tree = new FakeElement('div')
    tree.appendChild(new FakeElement('div'))
    paintArchiveSection(el(tree), el(null), rows, 'Archived (2)', true)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    expect(section).toBe(tree.lastElementChild)
  })

  it('renders one labelled row per archived session', () => {
    const tree = groupedTree()
    paintArchiveSection(el(tree), el(tree.childNodes[2] ?? null), rows, 'Archived (2)', true)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    const rowElements = section?.querySelectorAll(`[${ARCHIVE_ROW_ATTRIBUTE}]`) ?? []
    expect(rowElements.map(el => el.getAttribute(ARCHIVE_ROW_ATTRIBUTE))).toEqual(['s1', 's2'])
    expect(section?.querySelector(`.${ARCHIVE_HEADER_CLASS}`)?.textContent).toBe('Archived (2)')
  })

  it('removes the group when the archive list empties', () => {
    const tree = groupedTree()
    paintArchiveSection(el(tree), el(tree.childNodes[2] ?? null), rows, 'Archived (2)', true)
    paintArchiveSection(el(tree), el(tree.childNodes[2] ?? null), [], 'Archived (0)', true)
    expect(tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)).toBeNull()
  })

  it('hides rows when collapsed and restores them when expanded', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', false)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    expect(section?.querySelectorAll(`[${ARCHIVE_ROW_ATTRIBUTE}]`)).toEqual([])
    expect(section?.querySelector(`.${ARCHIVE_HEADER_CLASS}`)?.getAttribute('aria-expanded')).toBe('false')
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    expect(section?.querySelectorAll(`[${ARCHIVE_ROW_ATTRIBUTE}]`).length).toBe(2)
  })

  it('a second pass over a settled tree performs zero mutations', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    const afterFirst = mutations
    expect(afterFirst).toBeGreaterThan(0)
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    expect(mutations - afterFirst).toBe(0)
  })

  it('a second pass while collapsed performs zero mutations', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', false)
    const afterFirst = mutations
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', false)
    expect(mutations - afterFirst).toBe(0)
  })

  it('reorders rows when the archive order changes, then settles', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    const reordered: readonly ArchiveRow[] = [rows[1] ?? { id: 'x', label: 'x' }, rows[0] ?? { id: 'y', label: 'y' }]
    paintArchiveSection(el(tree), el(bucket), reordered, 'Archived (2)', true)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    const ids = section?.querySelectorAll(`[${ARCHIVE_ROW_ATTRIBUTE}]`)
      .map(el => el.getAttribute(ARCHIVE_ROW_ATTRIBUTE))
    expect(ids).toEqual(['s2', 's1'])
    const afterReorder = mutations
    paintArchiveSection(el(tree), el(bucket), reordered, 'Archived (2)', true)
    expect(mutations - afterReorder).toBe(0)
  })

  it('updates the label text when a session is renamed, without moving rows', () => {
    const tree = groupedTree()
    const bucket = tree.childNodes[2] ?? null
    paintArchiveSection(el(tree), el(bucket), rows, 'Archived (2)', true)
    const renamed: readonly ArchiveRow[] = [{ id: 's1', label: 'Renamed chat' }, rows[1] ?? { id: 's2', label: 'x' }]
    paintArchiveSection(el(tree), el(bucket), renamed, 'Archived (2)', true)
    const section = tree.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)
    const labels = section?.querySelectorAll(`[${ARCHIVE_ROW_ATTRIBUTE}]`)
      .map(el => el.querySelector('.dshWsArchiveRowLabel')?.textContent)
    expect(labels).toEqual(['Renamed chat', 'Sound design notes'])
  })
})

describe('clearArchiveSection', () => {
  it('removes the group from the region', () => {
    const region = new FakeElement('div')
    const tree = groupedTree()
    region.appendChild(tree)
    paintArchiveSection(el(tree), el(tree.childNodes[2] ?? null), rows, 'Archived (2)', true)
    expect(region.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)).not.toBeNull()
    clearArchiveSection(el(region))
    expect(region.querySelector(`[${ARCHIVE_SECTION_ATTRIBUTE}]`)).toBeNull()
  })

  it('is a no-op when nothing was painted', () => {
    const region = new FakeElement('div')
    const tree = groupedTree()
    region.appendChild(tree)
    clearArchiveSection(el(region))
    expect(tree.childNodes.length).toBe(3)
  })

  it('tolerates a null region', () => {
    clearArchiveSection(el(null))
  })
})
