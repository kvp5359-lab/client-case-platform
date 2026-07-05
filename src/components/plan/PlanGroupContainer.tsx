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
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown, ChevronRight, Plus, MoreHorizontal, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Ban, GripVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ACCENT_COLORS, ACCENT_COLOR_GROUPS, COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
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
  onSetColor: (color: string | null) => void
  onToggleClientVisible: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  renderChild: (item: MergedItem) => React.ReactNode
}

export function PlanGroupContainer({
  group, children, canEdit, onRename, onToggleCollapse, onDelete, onAddTask,
  onSetColor, onToggleClientVisible, onMoveUp, onMoveDown, renderChild,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(group.name)

  const collapsed = group.is_collapsed
  const count = children.length
  const { setNodeRef, isOver } = useDroppable({ id: `g:${group.id}` })
  // Сортировка самой группы (drag за ручку в заголовке). Id с префиксом
  // 'grp:' — отличаем от droppable-зоны содержимого ('g:<id>') и от строк.
  const {
    attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging,
  } = useSortable({ id: `grp:${group.id}`, disabled: !canEdit })
  const childIds = children.map((c) => c.id)
  // Цвет заголовка — акцент группы (та же палитра, что у тредов).
  const accentText = COLOR_TEXT[(group.accent_color ?? '') as ThreadAccentColor] ?? ''

  const commitName = () => {
    const v = draft.trim()
    if (v && v !== group.name) onRename(v)
    else setDraft(group.name)
    setEditing(false)
  }

  return (
    <div
      ref={setSortableRef}
      // Translate, НЕ Transform: у группы (высокий блок) среди коротких строк
      // dnd-kit добавлял scaleX/scaleY → визуальное сплющивание при drag'е.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('mb-1 rounded-lg border border-border/70 bg-muted/20', isDragging && 'opacity-60 z-10 relative')}
    >
      {/* Заголовок группы */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-0.5 -ml-0.5 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
            aria-label="Перетащить группу"
            title="Перетащить группу"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
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
            className={cn(
              'flex-1 min-w-0 truncate text-left text-sm font-semibold',
              accentText,
              canEdit && !accentText && 'hover:text-foreground',
            )}
            title={canEdit ? 'Переименовать группу' : undefined}
          >
            {group.name || 'Без названия'}
          </button>
        )}

        {/* Индикатор «скрыта от клиента» — виден только команде (клиент группу не увидит вовсе). */}
        {!group.visible_to_client && canEdit && (
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Скрыта от клиента" />
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
              <DropdownMenuContent align="end" className="w-[232px]">
                {/* Палитра цвета группы. Кнопки — не DropdownMenuItem, чтобы меню
                    не закрывалось на каждый клик (виден результат за меню). */}
                <div className="px-2 pt-1.5 pb-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Цвет группы</p>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <button
                      type="button"
                      className={cn(
                        'w-5 h-5 rounded-full border border-border flex items-center justify-center ring-offset-2',
                        !group.accent_color && 'ring-2 ring-muted-foreground/50',
                      )}
                      onClick={() => onSetColor(null)}
                      title="Без цвета"
                    >
                      <Ban className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {ACCENT_COLOR_GROUPS.map((cg) => (
                      <div key={cg} className="flex gap-1">
                        {ACCENT_COLORS.filter((c) => !c.hidden && c.group === cg).map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            className={cn(
                              'w-5 h-5 rounded-full ring-offset-2',
                              c.bg,
                              group.accent_color === c.value && `ring-2 ${c.ring}`,
                            )}
                            onClick={() => onSetColor(c.value)}
                            title={c.label}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onToggleClientVisible}>
                  {group.visible_to_client ? (
                    <><EyeOff className="h-4 w-4 mr-2" /> Скрыть от клиента</>
                  ) : (
                    <><Eye className="h-4 w-4 mr-2" /> Показывать клиенту</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
              <div className="flex flex-col [&>*:last-child]:border-b-0 [&>*:last-child_.border-b]:border-b-0">
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
