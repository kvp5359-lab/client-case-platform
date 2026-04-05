/**
 * Типы для ArticleTreePicker, вынесены из ArticleTreePicker.tsx,
 * чтобы TreeGroup.tsx и useArticleTreePicker.ts могли импортировать их
 * без циклической зависимости через родительский компонент.
 */

export interface ArticleTreePickerGroup {
  id: string
  name: string
  color: string | null
  parent_id: string | null
  sort_order: number
}

export interface ArticleTreePickerLink {
  article_id: string
  group_id: string
}
