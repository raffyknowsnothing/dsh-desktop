/** Desktop thinking-toggle composer copy. */

export const zh = {
  thinkingOn: '思考中',
  thinkingOff: '思考已关',
} as const

export type ThinkingToggleLocaleKey = keyof typeof zh

export const en: Record<ThinkingToggleLocaleKey, string> = {
  thinkingOn: 'Thinking on',
  thinkingOff: 'Thinking off',
}
