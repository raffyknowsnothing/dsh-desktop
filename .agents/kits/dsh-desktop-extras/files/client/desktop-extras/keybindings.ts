/**
 * Keyboard bindings owned by the Desktop extras. Every binding matches on
 * `KeyboardEvent.code`, never on `key`: macOS turns Option+F into `ƒ` and
 * Option+, into `≤`, so a `key` comparison would miss the very chords this
 * module exists to catch. `code` names the physical key and stays stable
 * under both modifiers and layout-independent handling.
 */

/** One chord, expressed as a physical key plus the modifiers it requires. */
export interface DesktopKeyBinding {
  /** `KeyboardEvent.code` of the physical key. */
  readonly code: string
  /** Requires Alt/Option. */
  readonly alt?: boolean
  /** Requires Ctrl. */
  readonly ctrl?: boolean
  /** Requires Cmd on macOS. */
  readonly meta?: boolean
  /** Requires Shift. */
  readonly shift?: boolean
}

/**
 * Open find-in-chat. Option+F rather than Cmd+F, which the surrounding app
 * already claims.
 */
export const FIND_IN_CHAT_BINDING: DesktopKeyBinding = { code: 'KeyF', alt: true }

/**
 * Open Preferences. Cmd+, on macOS and Ctrl+, elsewhere, matching the platform
 * convention. Both are listed; `matchesAny` accepts either, and no platform
 * produces both modifiers at once for this chord.
 */
export const PREFERENCES_BINDINGS: readonly DesktopKeyBinding[] = [
  { code: 'Comma', meta: true },
  { code: 'Comma', ctrl: true },
]

/**
 * Whether one keyboard event is exactly this chord. Modifiers left unset in
 * the binding must be absent from the event, so Cmd+Option+F does not fire the
 * Option+F binding.
 * @param event - the observed keyboard event.
 * @param binding - the chord to test against.
 * @returns whether the event matches.
 */
export function matches(event: KeyboardEvent, binding: DesktopKeyBinding): boolean {
  return event.code === binding.code
    && event.altKey === (binding.alt ?? false)
    && event.ctrlKey === (binding.ctrl ?? false)
    && event.metaKey === (binding.meta ?? false)
    && event.shiftKey === (binding.shift ?? false)
}

/**
 * Whether one keyboard event matches any chord in the list.
 * @param event - the observed keyboard event.
 * @param bindings - the chords to test against.
 * @returns whether the event matches at least one.
 */
export function matchesAny(event: KeyboardEvent, bindings: readonly DesktopKeyBinding[]): boolean {
  return bindings.some(binding => matches(event, binding))
}
