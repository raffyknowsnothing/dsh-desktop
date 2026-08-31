/**
 * ThinkingToggle: the composer's quick thinking on/off switch. It sits in the
 * `conversation.input.right` slot, immediately left of the model seat, and
 * flips the session's reasoning effort between the current level and `off`
 * through the SAME shared per-session ModelDirectory the model seat reads, so
 * the effort shown in the model pill stays in step. The switch renders only
 * for a model that exposes an `off` reasoning level; for every other model it
 * contributes nothing.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThinkingToggleLocaleKey } from './thinking-toggle-locales.ts'

/** Injected business face of the composer thinking toggle. */
export interface ThinkingToggleInjected {
  /** Whether this session supports Agent-bound model inspection and selection. */
  available: boolean
  /** The session's shared model directory store (same instance the model seat reads). */
  directory: SnapshotStore<ModelDirectoryState>
  /** Refresh the advisory directory (fire-and-forget; errors land on the store). */
  load: () => void
  /**
   * Select a complete provider/model/reasoning selection.
   * @param selection - model selection and optional adapter-owned effort.
   * @returns whether the host accepted the selection.
   */
  select: (selection: ModelSelection) => Promise<boolean>
}

/** Renderer-composed props for the thinking toggle slot entry. */
export type ThinkingToggleProps =
  PropsLocale<'desktop.thinking'>
  & InjectFace<ThinkingToggleInjected>

/** Locale keys this component reads from its bound dictionary. */
const KEYS: Record<'on' | 'off', ThinkingToggleLocaleKey> = { on: 'thinkingOn', off: 'thinkingOff' }

/** Render the thinking on/off switch. */
export function ThinkingToggle({ t, available, directory, load, select }: ThinkingToggleProps) {
  const state = useSyncExternalStore(
    (listener) => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  // The effort to restore when the user turns thinking back on. Kept across
  // renders; a manual effort change in the model seat while thinking is off
  // leaves a stale hint, but the restore falls back to the model default.
  const restoreRef = useRef<string | undefined>(undefined)

  // Populate the shared directory on mount even when the model seat mounted
  // first and already loaded it; a load is cheap and keeps the switch live.
  useEffect(() => {
    if (available) load()
  }, [available, load])

  const current = state.current
  if (!available || current === null) return null

  const model = state.groups.flatMap(group => group.models)
    .find(entry => entry.id === current.model)
  const reasoning = model?.reasoning
  if (reasoning === undefined || !reasoning.efforts.some(level => level.id === 'off')) return null

  const effectiveEffort = current.reasoningEffort ?? reasoning.defaultEffort
  const on = effectiveEffort !== 'off'
  const busy = state.status === 'selecting'
  const labelKey = KEYS[on ? 'on' : 'off']

  const toggle = (): void => {
    if (current === null) return
    if (on) {
      restoreRef.current = effectiveEffort
      void select({ provider: current.provider, model: current.model, reasoningEffort: 'off' })
      return
    }
    const effort = restoreRef.current ?? reasoning.defaultEffort
    void select({
      provider: current.provider,
      model: current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    })
  }

  const label = t(labelKey)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className="dshThinkingToggle"
      disabled={busy}
      onClick={toggle}
    >
      <span className="dshThinkingToggleDot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
