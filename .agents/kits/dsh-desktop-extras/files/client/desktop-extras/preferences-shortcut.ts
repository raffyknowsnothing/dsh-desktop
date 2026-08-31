/**
 * Desktop Preferences shortcut: Cmd+, on macOS, Ctrl+, elsewhere.
 *
 * The settings panel's open state is component-local React state inside the
 * upstream shell (ui-settings-general's SettingsRoot), and no service exposes
 * it. What the shell does expose is the trigger button, reachable through two
 * documented contracts: the renderer wraps every slot render site in a stable
 * `[data-slot="<key>"]` anchor, and the shell puts its trigger inside
 * `sidebar.settings` with `aria-haspopup="dialog"`. Clicking that button is
 * the same path a mouse takes, so the shell keeps ownership of its own state
 * and this module keeps no state at all.
 *
 * The alternative would be a native Preferences item in the macOS application
 * menu. That menu is deliberately renderer-free (electron-runtime builds it
 * from trusted native tray contributions only), so adding one would mean new
 * main-to-renderer plumbing for a shortcut the renderer can already serve.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { PREFERENCES_BINDINGS, matchesAny } from './keybindings.ts'

/** Selector for the settings trigger, built from the two upstream contracts. */
export const SETTINGS_TRIGGER_SELECTOR = '[data-slot="sidebar.settings"] button[aria-haspopup="dialog"]'

/** The settings trigger button, or null when no shell has rendered one. */
export function settingsTrigger(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(SETTINGS_TRIGGER_SELECTOR)
}

/**
 * Listen for the Preferences chord and open the settings panel.
 * @returns a disposer that removes the listener.
 */
export function installPreferencesShortcut(): () => void {
  if (typeof document === 'undefined') return () => {}
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!matchesAny(event, PREFERENCES_BINDINGS)) return
    const trigger = settingsTrigger()
    // No trigger means no settings shell in this window (a dialog or wizard
    // window); leave the chord to whatever else might want it.
    if (trigger === null) return
    event.preventDefault()
    // Already open: the panel owns the foreground, so re-triggering it would
    // only steal focus back to its close button.
    if (trigger.getAttribute('aria-expanded') === 'true') return
    trigger.click()
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => { document.removeEventListener('keydown', onKeyDown, true) }
}

/** Bind the Preferences chord for this Cordis generation. */
export function applyPreferencesShortcut(ctx: ClientContext): void {
  ctx.effect(
    () => installPreferencesShortcut(),
    'dsh-plugin-desktop: preferences shortcut',
  )
}
