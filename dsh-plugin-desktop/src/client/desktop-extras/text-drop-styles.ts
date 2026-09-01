/**
 * Styles for the staged-file tiles above the composer.
 *
 * Every selector names an element this plugin creates. Nothing reaches into
 * upstream markup: the packaged client hashes CSS-module class names per
 * module and per build, so a rule written against one would match nothing.
 *
 * Custom properties are the exception, and they are safe where class names are
 * not. `--dsh-composer-card-max-width` and `--dsh-composer-side-clearance` are
 * declared by ui-conversation on the conversation root and inherit down to the
 * dock, so the rail can size itself against the composer card without naming
 * any of upstream's classes. Both reads carry a fallback, because an unset
 * variable inside a calc is invalid at computed-value time and would collapse
 * the width rather than merely misplace the rail.
 */

const STYLE_ID = 'dsh-text-drop-styles'

/**
 * The stylesheet this feature installs.
 *
 * Exported so the rail's geometry contract can be asserted without a DOM: the
 * misalignment this guards against was a missing centring rule, which no
 * behavioural test would have caught.
 */
export const TEXT_DROP_CSS = `
.dshFileTiles {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
  box-sizing: border-box;
  /* Line the rail up with the composer card it sits above.
     'conversation.input.dock' is a plain flex child of upstream's
     '.composerStack', which spans the whole conversation column, while the
     input card centres itself and stops at --dsh-composer-card-max-width. A
     rail that only said 'width: 100%' therefore started at the far left of
     the column, nowhere near the input. Upstream's own dock entries
     (QueueDock, TodoPanel) re-centre themselves against the same two
     variables; this is that convention, not a new one.
     Fallbacks are real: mounted anywhere those variables are unset, the calc
     would be invalid at computed-value time and the width would collapse to
     auto. */
  width: calc(
    100% -
    var(--dsh-composer-side-clearance, 16px) -
    var(--dsh-composer-side-clearance, 16px)
  );
  max-width: var(--dsh-composer-card-max-width, 100%);
  margin: 0 auto;
  /* 17px, not the 8px dock inset: the first tile lines up with the draft text
     rather than with the card's edge. The card draws a 1px border and its
     draft surface pads 16px on the left (ui-conversation InputBar.module.css,
     '.input'). */
  padding: 0 17px 6px;
}
.dshFileTile {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: 260px;
  padding: 6px 6px 6px 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.dshFileTileIcon {
  display: inline-flex;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}
.dshFileTileText {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.dshFileTileName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dshFileTileMeta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dshFileTileRemove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dshFileTileRemove:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshFileTileRemove:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`

/** Install one scoped stylesheet; tolerate headless Client boot. */
export function installTextDropStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TEXT_DROP_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
