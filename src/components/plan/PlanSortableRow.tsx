"use client"

/**
 * Строка объединённого плоского списка плана: задача (через общий TaskRow) либо
 * блок (заголовок/текст/слот). Вынесено из ProjectFlatPlanList ради читаемости.
 */

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskRow } from '@/components/tasks/TaskRow'
import type { TaskItem } from '@/components/tasks/types'
import type { TaskTimeValue } from '@/components/tasks/TaskTimePickerPopover'
import type { TaskStatus } from '@/hooks/useStatuses'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { FolderSlotWithDocument } from '@/components/documents/types'
import { SlotItem } from '@/components/documents/Documents/SlotItem'
import { usePlanSlotHandlers } from './PlanDocsProvider'
import { HeadingBlockBody, TextBlockBody, htmlToPlain } from './PlanBlockItem'
import type { MergedItem } from './planTypes'

// Кнопка «+» по центру нижней границы строки — появляется на hover.
// revealClass передаётся ЛИТЕРАЛОМ (group-hover/<name>:opacity-100), потому
// что Tailwind JIT не видит динамически собранные имена групп.
function QuickAddBelow({ onClick, revealClass }: { onClick: () => void; revealClass: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`absolute -bottom-3 left-1/2 z-20 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-accent hover:text-foreground ${revealClass}`}
      aria-label="Добавить ниже"
      title="Добавить задачу, документ, заголовок или текст"
    >
      <Plus className="size-3.5" />
    </button>
  )
}

export function SortableRow({
  item,
  canEdit,
  workspaceId,
  taskStatuses,
  membersMap,
  finalStatusIds,
  selectedThreadId,
  showProject,
  deadlinePending,
  onOpenTask,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onTimeChange,
  onRequestDeleteTask,
  onChangeText,
  onDeleteBlock,
  onQuickAddHere,
}: {
  item: MergedItem
  canEdit: boolean
  workspaceId: string
  taskStatuses: TaskStatus[]
  membersMap: Record<string, AvatarParticipant[]>
  finalStatusIds: Set<string>
  selectedThreadId: string | null
  showProject: boolean
  deadlinePending: boolean
  onOpenTask: (id: string) => void
  onStatusChange: (taskId: string, statusId: string | null) => void
  onDeadlineSet: (taskId: string, date: Date) => void
  onDeadlineClear: (taskId: string) => void
  onTimeChange?: (taskId: string, v: TaskTimeValue) => void
  onRequestDeleteTask?: (task: TaskItem) => void
  onChangeText: (html: string) => void
  onDeleteBlock: () => void
  /** Открыть быстрое добавление с позицией ПОСЛЕ этой строки (task/heading). */
  onQuickAddHere?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // Свёрнут ли текстовый блок до одной строки (состояние на блок, key=id).
  // По умолчанию текст свёрнут — чтобы длинная «Стратегия» не занимала
  // пол-экрана над списком задач; разворачивается по клику/шеврону.
  const [collapsed, setCollapsed] = useState(
    item.kind === 'block' && item.display.block_type === 'text',
  )
  // Открыт ли редактор текста (textarea). Включается кнопкой-карандашом;
  // клик по самому тексту только сворачивает/разворачивает.
  const [editingText, setEditingText] = useState(false)

  if (item.kind === 'task') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative group/planrow ${isDragging ? 'opacity-60' : ''}`}
      >
        <TaskRow
          task={item.task}
          workspaceId={workspaceId}
          statuses={taskStatuses}
          members={membersMap[item.id] ?? []}
          onOpen={() => onOpenTask(item.id)}
          onStatusChange={(statusId) => onStatusChange(item.id, statusId)}
          onDeadlineSet={(date) => onDeadlineSet(item.id, date)}
          onDeadlineClear={() => onDeadlineClear(item.id)}
          onTimeChange={onTimeChange ? (v) => onTimeChange(item.id, v) : undefined}
          deadlinePending={deadlinePending}
          finalStatusIds={finalStatusIds}
          showProject={showProject}
          onRequestDelete={
            onRequestDeleteTask ? () => onRequestDeleteTask(item.task) : undefined
          }
          isActive={item.id === selectedThreadId}
          dragHandleProps={canEdit ? { attributes, listeners } : undefined}
        />
        {onQuickAddHere && (
          <QuickAddBelow onClick={onQuickAddHere} revealClass="group-hover/planrow:opacity-100" />
        )}
      </div>
    )
  }

  // Блок: заголовок / текст / слот. Контейнер повторяет TaskRow (px-3, gap-3,
  // грип абсолютным оверлеем), чтобы контент вставал в ту же левую колонку.
  const bt = item.display.block_type
  const isHeading = bt === 'heading'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/row relative flex gap-3 px-3 py-1 transition-colors hover:bg-muted/30 ${
        isHeading
          ? 'mt-3 items-center'
          : bt === 'text'
            ? 'items-start' // текст — без нижнего разделителя
            : 'items-start border-b border-border/50'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {canEdit && (
        <button
          type="button"
          className="absolute -left-6 top-2 cursor-grab touch-none p-0.5 opacity-0 transition-opacity group-hover/row:opacity-100"
          {...attributes}
          {...listeners}
          aria-label="Перетащить"
        >
          <GripVertical className="size-4 text-muted-foreground/40" />
        </button>
      )}

      {/* «+» под заголовком (для текста/слотов не показываем). */}
      {onQuickAddHere && isHeading && (
        <QuickAddBelow onClick={onQuickAddHere} revealClass="group-hover/row:opacity-100" />
      )}

      <div className="min-w-0 flex-1">
        {bt === 'heading' ? (
          <HeadingBlockBody
            content={item.display.content}
            editing={canEdit}
            onChange={onChangeText}
          />
        ) : bt === 'text' ? (
          editingText ? (
            <TextBlockBody
              content={item.display.content}
              onChange={onChangeText}
              onClose={() => setEditingText(false)}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed((c) => !c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setCollapsed((c) => !c)
                }
              }}
              className="-mx-1 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50"
              title={collapsed ? 'Развернуть' : 'Свернуть'}
            >
              {collapsed ? (
                <p className="truncate text-sm text-muted-foreground">
                  {stripHtml(item.display.content) || 'Пустой текст'}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {htmlToPlain(item.display.content ?? '') || 'Пустой текст'}
                </p>
              )}
            </div>
          )
        ) : (
          <PlanSlotItem fullSlot={item.kind === 'block' ? item.fullSlot ?? null : null} />
        )}
      </div>

      {/* Текст: карандаш (редактировать) + корзина — оверлеем в правом верхнем
          углу, не резервируют место и не ограничивают ширину текста. */}
      {canEdit && bt === 'text' && (
        <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-md bg-background text-muted-foreground shadow-sm hover:text-foreground"
            onClick={() => {
              setEditingText(true)
              setCollapsed(false)
            }}
            aria-label="Редактировать"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 rounded-md bg-background text-muted-foreground shadow-sm hover:text-destructive"
            onClick={onDeleteBlock}
            aria-label="Удалить блок"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}

      {canEdit && bt !== 'text' && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-0.5 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
          onClick={onDeleteBlock}
          aria-label="Удалить блок"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}

/** Слот документа в плане — настоящий SlotItem из «Документов» (reuse). */
function PlanSlotItem({ fullSlot }: { fullSlot: FolderSlotWithDocument | null }) {
  const { onSlotClick, onSlotRename } = usePlanSlotHandlers()
  if (!fullSlot) {
    return <span className="py-1 text-sm italic text-muted-foreground">Документ удалён</span>
  }
  const el = <SlotItem slot={fullSlot} onSlotClick={onSlotClick} onSlotRename={onSlotRename} />
  // Пустой слот = пилюля (<div>), заполненный = DocumentItem (<tr>). Чтобы <tr>
  // был валидным вне таблицы документов — оборачиваем в собственную таблицу.
  if (fullSlot.document_id) {
    return (
      <table className="w-full">
        <tbody>{el}</tbody>
      </table>
    )
  }
  return el
}

/** HTML → одна строка текста (для свёрнутого вида). */
function stripHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
