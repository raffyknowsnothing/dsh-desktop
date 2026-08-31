/**
 * Find-in-chat panel styles plus the two `::highlight()` rules that paint
 * matches. Installed independently of presentation mode, like the thinking
 * toggle's stylesheet.
 *
 * `::highlight()` accepts only a narrow property set (color, background-color,
 * text-decoration, text-shadow, -webkit-text-stroke), so the active match is
 * distinguished by colour rather than by weight or outline.
 */

const STYLE_ID = 'dsh-find-in-chat-styles'

const CSS = `
.dshFindInChat {
  position: absolute;
  top: 12px;
  right: 20px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 34px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  box-shadow: 0 6px 20px rgb(0 0 0 / 18%);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.dshFindInChatField {
  width: 190px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  outline: none;
}
.dshFindInChatField::placeholder { color: var(--dsw-alias-label-quaternary, var(--dsw-alias-label-secondary)); }
.dshFindInChatCount {
  flex: none;
  min-width: 54px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.dshFindInChatCount[data-empty="true"] { color: var(--dsw-alias-label-error, var(--dsw-alias-state-error-primary)); }
.dshFindInChatDivider {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--dsw-alias-border-l2);
}
.dshFindInChatButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1;
}
.dshFindInChatButton:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshFindInChatButton:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dshFindInChatButton:disabled { cursor: default; opacity: .4; }

::highlight(dsh-find-match) {
  background-color: color-mix(in srgb, var(--dsw-alias-state-warning-primary) 42%, transparent);
  color: var(--dsw-alias-label-primary);
}
::highlight(dsh-find-current) {
  background-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-foreground);
}

@media (prefers-reduced-motion: reduce) {
  .dshFindInChat { box-shadow: none; }
}
`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installFindInChatStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
