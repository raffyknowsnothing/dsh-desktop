/** Desktop find-in-chat panel copy. */

export const zh = {
  placeholder: '在对话中查找',
  count: '{current}/{total}',
  empty: '无结果',
  previous: '上一个',
  next: '下一个',
  close: '关闭查找',
} as const

export type FindInChatLocaleKey = keyof typeof zh

export const en: Record<FindInChatLocaleKey, string> = {
  placeholder: 'Find in chat',
  count: '{current} of {total}',
  empty: 'No results',
  previous: 'Previous match',
  next: 'Next match',
  close: 'Close find',
}
