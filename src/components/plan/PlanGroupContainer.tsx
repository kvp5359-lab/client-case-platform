"use client"

/**
 * Контейнер группы задач в плане проекта: заголовок (сворачивание,
 * переименование, «+ задача», меню-удаление) + вложенные строки.
 *
 * Рендер вложенных строк передаётся коллбэком `renderChild` из
 * ProjectFlatPlanList (там весь набор хендлеров), чтобы не тащить 20 пропов.
 * DnD внутри группы — отдельная фаза; сейчас строки в статичном порядке.
 */

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { TaskGroupRow } from '@/types/taskGroups'
import type { MergedItem } from './planTypes'

type Props = {
  group: TaskGroupRow
  children: MergedItem[]
  canEdit: boolean
  onRename: (name: string) => void
  onToggleCollapse: () => void
  onDelete: () => void
  onAddTask: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  renderChild: (item: MergedItem) => React.ReactNode
}

export function PlanGroupContainer({
  group, children, canEdit, onRename, onToggleCollapse, onDelete, onAddTask, onMoveUp, onMoveDown, renderChild,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)

  const collapsed = group.is_collapsed
  const count = children.length
  const { setNodeRef, isOver } = useDroppable({ id: `g:${group.id}` })
  const childIds = children.map((c) => c.id)

  const commitName = () => {
    const v = draft.trim()
    if (v && v !== group.name) onRename(v)
    else setDraft(group.name)
    setEditing(false)
  }

  return (
    <div className="mb-1 rounded-lg border border-border/70 bg-muted/20">
      {/* Заголовок группы */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Развернуть группу' : 'Свернуть группу'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {editing && canEdit ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setDraft(group.name); setEditing(false) }
            }}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none border-b border-border focus:border-foreground"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && setEditing(true)}
            className={cn('flex-1 min-w-0 truncate text-left text-sm font-semibold', canEdit && 'hover:text-foreground')}
            title={canEdit ? 'Переименовать группу' : undefined}
          >
            {group.name || 'Без названия'}
          </button>
        )}

        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>

        {canEdit && (
          <>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground disabled:opacity-30"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              title="Переместить группу выше"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground disabled:opacity-30"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              title="Переместить группу ниже"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground md:opacity-0 md:group-hover/planroot:opacity-100"
              onClick={onAddTask}
              title="Добавить задачу в группу"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 mr-2" /> Удалить группу
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Содержимое — droppable-зона + сортировка внутри группы */}
      {!collapsed && (
        <div ref={setNodeRef} className={cn('pb-1 rounded-b-lg', isOver && 'bg-accent/40')}>
          <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
            {count === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Пусто. {canEdit && 'Перетащите задачу сюда или нажмите +.'}
              </div>
            ) : (
              <div className="flex flex-col">
                {children.map((item) => (
                  <div key={item.id}>{renderChild(item)}</div>
                ))}
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
