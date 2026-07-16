"use client"

/**
 * Вкладка «Статьи»: статьи базы знаний проекта, сгруппированные по группам БЗ.
 * Порядок групп и статей задаёт сервер (get_project_shareable_resources) —
 * здесь не сортируем.
 */

import { ChevronRight, FileText } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { SelectBadge } from '@/components/share/shareRowParts'
import type { ShareableArticle } from '@/services/api/shareLinks'
import type { ReactNode } from 'react'

export type ArticleGroup = { group: string; items: ShareableArticle[] }

type Props = {
  groups: ArticleGroup[]
  selected: Set<string>
  numberOf: (key: string) => string | null
  onToggle: (key: string) => void
  onSetSelected: (keys: string[], select: boolean) => void
  expandedGroups: Set<string>
  onToggleGroup: (group: string) => void
  /** Поиск активен — раскрываем всё и прячем «Развернуть всё». */
  forceExpand: boolean
  allExpanded: boolean
  onToggleAll: () => void
  onInsertOne: (label: string, articleId: string | null, token: string | null) => void
  renderActions: (label: string, articleId: string | null, token: string | null) => ReactNode
}

export function ArticleGroupsView({
  groups,
  selected,
  numberOf,
  onToggle,
  onSetSelected,
  expandedGroups,
  onToggleGroup,
  forceExpand,
  allExpanded,
  onToggleAll,
  onInsertOne,
  renderActions,
}: Props) {
  const renderRow = (a: ShareableArticle) => {
    const key = `art:${a.article_id}`
    return (
      <div
        key={key}
        className="group/row flex items-center gap-2.5 rounded-md py-0.5 pl-9 pr-2 hover:bg-accent"
      >
        <SelectBadge n={numberOf(key)} onClick={() => onToggle(key)} />
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <button
          type="button"
          onClick={() => onInsertOne(a.title, a.article_id, a.token)}
          className="min-w-0 flex-1 truncate text-left text-sm"
          title="Вставить ссылку в сообщение"
        >
          {a.title}
        </button>
        {renderActions(a.title, a.article_id, a.token)}
      </div>
    )
  }

  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-[11px] text-muted-foreground/70">закроются при завершении проекта</span>
        {!forceExpand && (
          <button
            type="button"
            onClick={onToggleAll}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            {allExpanded ? 'Свернуть всё' : 'Развернуть всё'}
          </button>
        )}
      </div>
      <div className="space-y-0">
        {groups.map(({ group, items }) => {
          const expanded = forceExpand || expandedGroups.has(group)
          const groupKeys = items.map((a) => `art:${a.article_id}`)
          const selCount = groupKeys.filter((k) => selected.has(k)).length
          const groupState: boolean | 'indeterminate' =
            selCount === 0 ? false : selCount === groupKeys.length ? true : 'indeterminate'
          return (
            <div key={group}>
              <div className="group/gh flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-accent/60">
                <Checkbox
                  checked={groupState}
                  onCheckedChange={() => onSetSelected(groupKeys, selCount !== groupKeys.length)}
                  aria-label="Выбрать все статьи группы"
                />
                <button
                  type="button"
                  onClick={() => onToggleGroup(group)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform',
                      expanded && 'rotate-90',
                    )}
                  />
                  <span className="truncate text-[15px] font-medium">{group}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
                    {items.length}
                  </span>
                </button>
              </div>
              {expanded && <div className="space-y-0">{items.map(renderRow)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
