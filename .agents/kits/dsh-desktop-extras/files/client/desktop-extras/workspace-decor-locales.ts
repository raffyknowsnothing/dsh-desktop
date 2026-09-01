/**
 * Desktop sidebar decoration copy: folder colours and named dividers.
 *
 * The colour names are dictionary entries rather than a hardcoded English
 * table, because they are read aloud — each swatch's only accessible name is
 * its colour.
 */

export const zh = {
  'color.label': '文件夹颜色',
  'color.default': '默认颜色',
  'color.red': '红色',
  'color.orange': '橙色',
  'color.amber': '琥珀色',
  'color.green': '绿色',
  'color.teal': '青色',
  'color.blue': '蓝色',
  'color.purple': '紫色',
  'color.pink': '粉色',
  'divider.add': '在上方添加分隔线',
  'divider.rename': '重命名分隔线',
  'divider.remove': '删除分隔线',
  'divider.placeholder': '分隔线名称',
  'menu.workspace.aria': '{name} 的侧边栏选项',
  'menu.divider.aria': '分隔线选项',
  'archive.header': '已归档 ({count})',
  save: '保存',
  cancel: '取消',
} as const

export type WorkspaceDecorLocaleKey = keyof typeof zh

export const en: Record<WorkspaceDecorLocaleKey, string> = {
  'color.label': 'Folder colour',
  'color.default': 'Default colour',
  'color.red': 'Red',
  'color.orange': 'Orange',
  'color.amber': 'Amber',
  'color.green': 'Green',
  'color.teal': 'Teal',
  'color.blue': 'Blue',
  'color.purple': 'Purple',
  'color.pink': 'Pink',
  'divider.add': 'Add divider above',
  'divider.rename': 'Rename divider',
  'divider.remove': 'Remove divider',
  'divider.placeholder': 'Divider name',
  'menu.workspace.aria': 'Sidebar options for {name}',
  'menu.divider.aria': 'Divider options',
  'archive.header': 'Archived ({count})',
  save: 'Save',
  cancel: 'Cancel',
}

/**
 * Dictionary key for one palette id.
 * @param paletteId - the swatch id.
 * @returns the locale key naming that colour.
 */
export function swatchNameKey(paletteId: string): WorkspaceDecorLocaleKey {
  return `color.${paletteId}` as WorkspaceDecorLocaleKey
}
