/**
 * Sidebar decoration styles: the divider row and the right-click menu.
 *
 * Every selector here names an element this plugin created. Nothing reaches
 * into upstream's markup, because there is no stable handle to reach with: the
 * packaged client hashes CSS-module class names per module and per build, so a
 * rule written against `.projectRow` matches nothing in a real app. The folder
 * colour is therefore applied inline by workspace-decor-paint.ts rather than
 * declared here.
 */

const STYLE_ID = 'dsh-workspace-decor-styles'

const CSS = `
.dshWsDivider {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  margin: 10px 0 2px;
  padding: 0 8px;
  min-height: 18px;
  cursor: default;
  user-select: none;
}
/* The rule is an ::after so an empty divider still paints a full-width line
   without needing a second element. */
.dshWsDivider::after {
  content: "";
  flex: 1 1 auto;
  height: 1px;
  background: var(--dsw-alias-border-l2);
}
.dshWsDivider[data-dsh-divider-empty="true"] { margin-top: 8px; }
.dshWsDividerLabel {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.dshWsDivider[data-dsh-divider-empty="true"] .dshWsDividerLabel { display: none; }

.dshWsMenu {
  position: fixed;
  z-index: 1200;
  box-sizing: border-box;
  min-width: 188px;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  box-shadow: 0 8px 28px rgb(0 0 0 / 22%);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.dshWsMenuTitle {
  padding: 4px 8px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshWsSwatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 2px 4px 6px;
}
.dshWsSwatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.dshWsSwatch:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshWsSwatch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dshWsSwatchDot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsh-ws-swatch);
}
/* The default entry is an outline rather than a filled dot: it clears the
   colour, so showing it as one more colour would misread. */
.dshWsSwatch[data-default="true"] .dshWsSwatchDot {
  border: 1.5px solid var(--dsw-alias-label-tertiary);
  background: transparent;
}
.dshWsSwatch[aria-pressed="true"] { border-color: var(--dsw-alias-label-secondary); }

.dshWsMenuSep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l2);
}
.dshWsMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 7px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  text-align: left;
}
.dshWsMenuItem:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshWsMenuItem:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dshWsMenuItem[data-danger="true"] { color: var(--dsw-alias-state-error-primary, #e5484d); }

.dshWsMenuField {
  box-sizing: border-box;
  width: 100%;
  margin: 2px 0 6px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: inherit;
  font: inherit;
  font-size: 12px;
  outline: none;
}
.dshWsMenuField:focus { border-color: var(--dsw-alias-brand-primary); }

@media (prefers-reduced-motion: reduce) {
  .dshWsMenu { box-shadow: none; }
}
`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installWorkspaceDecorStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
