/** Thinking-toggle composer styles, installed independently of presentation mode. */

const STYLE_ID = 'dsh-thinking-toggle-styles'

const CSS = `
.dshThinkingToggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 20px;
  white-space: nowrap;
}
.dshThinkingToggle:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dshThinkingToggle:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dshThinkingToggle:disabled { cursor: default; opacity: .5; }
.dshThinkingToggleDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}
.dshThinkingToggle[aria-checked="true"] .dshThinkingToggleDot {
  background: var(--dsw-alias-state-success-primary);
}
`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installThinkingToggleStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
