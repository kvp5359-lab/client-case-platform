"use client"

/**
 * Один блок плана: текст / задача / слот.
 *
 * - text: read — HTML через prose; edit — TiptapEditor с автосохранением (debounce).
 * - task: ссылка на задачу — иконка, имя, галочка «готово» (по is_final статуса), срок.
 * - slot: ссылка на слот документа — имя, статус «собран/нужен», срок (редактируемый).
 *
 * Задачи/слоты живые: данные подмешиваются в PlanSection из useProjectThreads /
 * useFolderSlots, здесь только отрисовка. Редактирование статуса задачи — НЕ тут
 * (для этого список задач), здесь галочка только отражает текущий статус.
 */

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Trash2, CheckSquare, FolderOpen, AlertTriangle } from 'lucide-react'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import { DeadlinePopover } from '@/components/tasks/DeadlinePopover'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import {
  ParticipantAvatars,
  type AvatarParticipant,
} from '@/components/participants/ParticipantAvatars'
import { PLAN_TEXT_CLASS } from './planTextClass'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatShortDate, formatDateToString, parseDateString } from '@/utils/format/dateFormat'

/** Модель отображения блока — собирается в PlanSection. */
export type PlanBlockDisplay = {
  id: string
  block_type: 'text' | 'task' | 'slot'
  visible_to_client: boolean
  content: string | null
  task: {
    threadId: string
    name: string
    deadline: string | null
    done: boolean
    assignees: AvatarParticipant[]
  } | null
  slot: {
    name: string
    deadline: string | null
    filled: boolean
  } | null
  /** Ссылка ведёт на удалённую/недоступную сущность. */
  missing: boolean
}

type Props = {
  display: PlanBlockDisplay
  editable: boolean
  projectId: string
  workspaceId: string
  onChangeText: (html: string) => void
  onDelete: () => void
  onChangeSlotDeadline: (deadline: string | null) => void
  onChangeTaskDeadline: (deadline: string | null) => void
  taskDeadlinePending: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}

export function PlanBlockItem({
  display,
  editable,
  projectId,
  workspaceId,
  onChangeText,
  onDelete,
  onChangeSlotDeadline,
  onChangeTaskDeadline,
  taskDeadlinePending,
  dragHandleProps,
}: Props) {
  return (
    <div className="group flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 hover:border-border">
      {editable && (
        <button
          type="button"
          className="mt-1 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
          {...dragHandleProps}
          aria-label="Перетащить"
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {display.block_type === 'text' && (
          <TextBlockBody content={display.content} editing={editable} onChangeText={onChangeText} />
        )}

        {display.block_type === 'task' && (
          <TaskBlockBody
            display={display}
            editable={editable}
            projectId={projectId}
            workspaceId={workspaceId}
            onChangeDeadline={onChangeTaskDeadline}
            pending={taskDeadlinePending}
          />
        )}

        {display.block_type === 'slot' && (
          <SlotBlockBody
            display={display}
            editing={editable}
            onChangeSlotDeadline={onChangeSlotDeadline}
          />
        )}
      </div>

      {editable && (
        <div className="flex items-center pt-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Удалить блок"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Текстовый блок ────────────────────────────────────────

function TextBlockBody({
  content,
  editing,
  onChangeText,
}: {
  content: string | null
  editing: boolean
  onChangeText: (html: string) => void
}) {
  // Локальное состояние редактора сидируется из content один раз (блок
  // привязан по key=id, при смене блока компонент пересоздаётся). После
  // автосохранения content становится равен html, дрейфа нет.
  const [html, setHtml] = useState(content ?? '')
  // active — открыт ли редактор у ЭТОГО блока. В режиме редактирования плана
  // по умолчанию показываем чистый текст; редактор раскрывается по клику.
  const [active, setActive] = useState(false)
  const editorWrapRef = useRef<HTMLDivElement>(null)

  // Автосохранение через debounce, пока редактор активен.
  useEffect(() => {
    if (!active) return
    if (html === (content ?? '')) return
    const t = setTimeout(() => onChangeText(html), 800)
    return () => clearTimeout(t)
  }, [html, active, content, onChangeText])

  // При активации переносим фокус в редактор (immediatelyRender:false —
  // contenteditable появляется чуть позже), чтобы click-away (blur) закрывал блок.
  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => {
      const el = editorWrapRef.current?.querySelector(
        '[contenteditable="true"]',
      ) as HTMLElement | null
      el?.focus()
    }, 40)
    return () => clearTimeout(id)
  }, [active])

  const isEmpty = !content || content === '<p></p>'

  // Чистый текст: всегда вне режима редактирования, и в режиме —
  // пока блок не активен (не кликнут).
  if (!editing || !active) {
    return (
      <div
        className={
          editing ? 'cursor-text rounded -mx-1 px-1 py-0.5 hover:bg-muted/50' : ''
        }
        onClick={editing ? () => setActive(true) : undefined}
        role={editing ? 'button' : undefined}
        tabIndex={editing ? 0 : undefined}
        onKeyDown={
          editing
            ? (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setActive(true)
                }
              }
            : undefined
        }
      >
        {isEmpty ? (
          <p className="text-sm italic text-muted-foreground">
            {editing ? 'Нажмите, чтобы добавить текст' : 'Пустой текстовый блок'}
          </p>
        ) : (
          <div
            className={PLAN_TEXT_CLASS}
            // Контент создаётся сотрудником через Tiptap внутри ЛК.
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    )
  }

  // Активный редактор: закрываем по уходу фокуса наружу (клик по блоку/панели
  // редактора фокус не теряет — relatedTarget внутри контейнера).
  return (
    <div
      ref={editorWrapRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setActive(false)
          if (html !== (content ?? '')) onChangeText(html)
        }
      }}
    >
      <TiptapEditor
        content={html}
        onChange={setHtml}
        minHeight="80px"
        editorClassName="text-sm"
        placeholder="Текст плана — пояснение, раздел, стратегия…"
      />
    </div>
  )
}

// ── Блок-задача ───────────────────────────────────────────

function TaskBlockBody({
  display,
  editable,
  projectId,
  workspaceId,
  onChangeDeadline,
  pending,
}: {
  display: PlanBlockDisplay
  editable: boolean
  projectId: string
  workspaceId: string
  onChangeDeadline: (deadline: string | null) => void
  pending: boolean
}) {
  if (display.missing || !display.task) {
    return <MissingRef icon={<CheckSquare className="size-4" />} label="Задача удалена или недоступна" />
  }
  const { threadId, name, deadline, done, assignees } = display.task
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox checked={done} disabled aria-label={done ? 'Готово' : 'Не готово'} />
      <span
        className={`min-w-0 truncate text-sm ${done ? 'text-muted-foreground line-through' : ''}`}
      >
        {name}
      </span>

      {/* Срок — сразу после названия. Тот же chip, что в списке задач. */}
      {editable ? (
        <DeadlinePopover
          deadline={deadline}
          onSet={(date) => onChangeDeadline(date.toISOString())}
          onClear={() => onChangeDeadline(null)}
          isPending={pending}
          isFinal={done}
        />
      ) : (
        deadline && (
          <span className="shrink-0 text-xs text-muted-foreground">{formatShortDate(deadline)}</span>
        )
      )}

      {/* Исполнители — тот же компонент, что в задачах (AssigneesPopover). */}
      {editable ? (
        <AssigneesPopover
          mode="thread"
          threadId={threadId}
          projectId={projectId}
          workspaceId={workspaceId}
          assignees={assignees}
          dimmed={done}
        />
      ) : (
        assignees.length > 0 && (
          <ParticipantAvatars participants={assignees} maxVisible={3} size="sm" />
        )
      )}
    </div>
  )
}

// ── Блок-слот (документ) ──────────────────────────────────

function SlotBlockBody({
  display,
  editing,
  onChangeSlotDeadline,
}: {
  display: PlanBlockDisplay
  editing: boolean
  onChangeSlotDeadline: (deadline: string | null) => void
}) {
  if (display.missing || !display.slot) {
    return <MissingRef icon={<FolderOpen className="size-4" />} label="Документ удалён или недоступен" />
  }
  const { name, deadline, filled } = display.slot

  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox checked={filled} disabled aria-label={filled ? 'Собран' : 'Нужен'} />
      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{name}</span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
          filled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {filled ? 'собран' : 'нужен'}
      </span>

      {editing ? (
        <Input
          type="date"
          value={deadline ? formatDateToString(parseDateString(deadline) ?? null) : ''}
          onChange={(e) => {
            const v = e.target.value
            onChangeSlotDeadline(v ? new Date(v).toISOString() : null)
          }}
          className="ml-auto h-7 w-36 text-xs"
        />
      ) : (
        deadline && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatShortDate(deadline)}
          </span>
        )
      )}
    </div>
  )
}

function MissingRef({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <AlertTriangle className="size-4 text-amber-500" />
      <span className="opacity-60">{icon}</span>
      <span className="italic">{label}</span>
    </div>
  )
}
