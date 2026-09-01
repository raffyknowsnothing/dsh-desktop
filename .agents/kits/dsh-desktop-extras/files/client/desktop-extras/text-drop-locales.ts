/** Copy for the staged-file tiles above the composer. */

export const zh = {
  'tiles.aria': '已附加的文件',
  'tiles.meta': '{chars} 个字符',
  'tiles.metaTruncated': '{chars} 个字符，已截断',
  'tiles.remove': '移除 {name}',
} as const

export type TextDropLocaleKey = keyof typeof zh

export const en: Record<TextDropLocaleKey, string> = {
  'tiles.aria': 'Attached files',
  'tiles.meta': '{chars} characters',
  'tiles.metaTruncated': '{chars} characters, truncated',
  'tiles.remove': 'Remove {name}',
}
