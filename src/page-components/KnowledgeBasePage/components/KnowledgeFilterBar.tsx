/**
 * KnowledgeFilterBar — единая строка фильтров базы знаний.
 *
 * Одна строка чипов: быстрые Статус/Группа/Тег (+ «без …») + доп. поля,
 * добавляемые кнопкой «+ Фильтр» (автор, даты, опубликовано, режим доступа,
 * статус индексации, название). Каждый доп. фильтр — чип с попап-редактором
 * (переиспользует FilterRuleRow из движка src/lib/filters). Расширенного
 * редактора как отдельного блока больше нет — всё в одну строку.
 */

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getFieldsForEntity, getFieldDef } from '@/lib/filters/filterDefinitions'
import { FilterRuleRow } from '@/components/filters/FilterRuleRow'
import type { FilterCondition } from '@/lib/filters/types'
import { NotionFilterRow } from './NotionFilterRow'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

// Поля для «+ Фильтр» — все, кроме статус/группа/тег (они — быстрые чипы).
const EXTRA_FIELDS = getFieldsForEntity('knowledge_article').filter(
  (f) => !['status_id', 'groups', 'tags'].includes(f.key),
)

function formatChip(cond: FilterCondition): string {
  const def = getFieldDef('knowledge_article', cond.field)
  const label = def?.label ?? cond.field
  const v = cond.value
  let val = ''
  if (v === '__me__' || (Array.isArray(v) && v.includes('__me__'))) val = 'я'
  else if (def?.type === 'boolean') val = v === false ? 'нет' : 'да'
  else if (Array.isArray(v)) val = v.length ? `${v.length}` : ''
  else if (typeof v === 'string' && v) val = v
  return val ? `${label}: ${val}` : label
}

function defaultCondition(field: string): FilterCondition {
  const def = getFieldDef('knowledge_article', field)
  return {
    type: 'condition',
    field,
    operator: def?.operators[0] ?? 'equals',
    value: def?.type === 'boolean' ? true : null,
  }
}

function ConditionChip({
  condition,
  workspaceId,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  workspaceId: string
  onChange: (next: FilterCondition) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="text-xs px-2 py-1 text-blue-700 hover:bg-blue-100 rounded-l-md">
            {formatChip(condition)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <FilterRuleRow
            condition={condition}
            onChange={onChange}
            onRemove={onRemove}
            entityType="knowledge_article"
            workspaceId={workspaceId}
          />
        </PopoverContent>
      </Popover>
      <button
        onClick={onRemove}
        className="px-1 py-1 text-blue-700/60 hover:text-destructive rounded-r-md"
        aria-label="Убрать фильтр"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function KnowledgeFilterBar({ page }: { page: PageReturn }) {
  const conditions = page.advancedFilter.rules
  const usedFields = new Set(
    conditions.filter((r) => r.type === 'condition').map((r) => (r as FilterCondition).field),
  )
  const available = EXTRA_FIELDS.filter((f) => !usedFields.has(f.key))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Быстрые чипы: статус/группа/тег (+ «без …») */}
      <NotionFilterRow
        status={{
          selectedIds: page.filterStatusIds,
          onToggle: (id) =>
            page.setFilterStatusIds((prev: string[]) =>
              prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
            ),
          onClear: () => page.setFilterStatusIds([]),
          options: [
            ...page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
            { id: '__none__', name: 'Без статуса', color: '#9CA3AF' },
          ],
        }}
        group={{
          selectedIds: page.filterGroupIds,
          onToggle: (id) =>
            page.setFilterGroupIds((prev: string[]) =>
              prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
            ),
          onClear: () => page.setFilterGroupIds([]),
          options: [
            ...page.groups.map((g) => ({ id: g.id, name: g.name })),
            { id: '__none__', name: 'Без группы' },
          ],
          treeGroups: page.groups,
        }}
        tag={{
          selectedIds: page.filterTagIds,
          onToggle: (id) =>
            page.setFilterTagIds((prev: string[]) =>
              prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
            ),
          onClear: () => page.setFilterTagIds([]),
          options: [
            ...page.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
            { id: '__none__', name: 'Без тега' },
          ],
        }}
      />

      {/* Доп. фильтры (чипы) */}
      {conditions.map((rule, i) =>
        rule.type === 'condition' ? (
          <ConditionChip
            key={i}
            condition={rule}
            workspaceId={page.workspaceId ?? ''}
            onChange={(next) => page.updateAdvancedCondition(i, next)}
            onRemove={() => page.removeAdvancedCondition(i)}
          />
        ) : null,
      )}

      {/* + Фильтр */}
      {available.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Фильтр
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {available.map((f) => (
              <DropdownMenuItem key={f.key} onClick={() => page.addAdvancedCondition(defaultCondition(f.key))}>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
