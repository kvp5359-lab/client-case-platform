/**
 * NotionFilterRow — строка фильтров (Статус, Группа, Тег) в стиле Notion.
 *
 * Общий компонент для всех вкладок базы знаний (Дерево, Таблица, Q&A).
 * Группа использует иерархический tree picker (GroupTreeFilterContent).
 * Набор фильтров настраивается через пропсы — статус можно не передавать.
 */

import { FilterChip, type FilterType } from './FilterChip'
import { GroupTreeFilterContent } from './GroupTreeFilterContent'

interface FilterDef {
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  options: { id: string; name: string; color?: string }[]
}

interface GroupFilterDef extends FilterDef {
  /** Полный список групп для иерархического дерева (parent_id, sort_order) */
  treeGroups: Array<{ id: string; name: string; parent_id: string | null; sort_order: number }>
}

interface NotionFilterRowProps {
  status?: FilterDef
  group: GroupFilterDef
  tag: FilterDef
}

export function NotionFilterRow({ status, group, tag }: NotionFilterRowProps) {
  const filters: Array<{ type: FilterType; def: FilterDef; isGroup?: boolean }> = []

  if (status) filters.push({ type: 'status', def: status })
  filters.push({ type: 'group', def: group, isGroup: true })
  filters.push({ type: 'tag', def: tag })

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map(({ type, def, isGroup }) => (
        <FilterChip
          key={type}
          type={type}
          selectedIds={def.selectedIds}
          onToggle={def.onToggle}
          onClear={def.onClear}
          options={def.options}
          {...(isGroup && {
            popoverContent: (
              <GroupTreeFilterContent
                groups={(def as GroupFilterDef).treeGroups}
                selectedIds={def.selectedIds}
                onToggle={def.onToggle}
              />
            ),
            popoverClassName: 'w-96 p-0',
          })}
        />
      ))}
    </div>
  )
}
