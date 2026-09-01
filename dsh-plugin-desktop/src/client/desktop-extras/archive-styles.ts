/**
 * Archived-group styles: the header row and the Session rows below it.
 *
 * Same rule as the rest of the kit: every selector names an element this
 * plugin created. Nothing reaches into upstream's markup, because there is no
 * stable handle to reach with — the packaged client hashes CSS-module class
 * names per module and per build.
 */

const STYLE_ID = 'dsh-archive-styles'

const CSS = `
.dshWsArchive {
  box-sizing: border-box;
  margin: 4px 0 0;
}
.dshWsArchiveHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  text-align: left;
  text-transform: uppercase;
}
/* The chevron marks the fold state; rotated when open. */
.dshWsArchiveHeader::before {
  content: "▸";
  font-size: 9px;
  transition: transform .12s ease;
}
.dshWsArchiveHeader[aria-expanded="true"]::before { transform: rotate(90deg); }
.dshWsArchiveHeader:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshWsArchiveHeader:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshWsArchiveRow {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  padding: 5px 8px 5px 16px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
}
.dshWsArchiveRow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshWsArchiveRow:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshWsArchiveRowLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installArchiveStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
