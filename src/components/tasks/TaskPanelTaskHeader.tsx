"use client"

/**
 * Шапка TaskPanel в режиме 1 (тред).
 * Три строки: статус/имя/действия, мета-строка, email-получатели.
 */

import { useState, useRef, useEffect, createElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Settings, ExternalLink, X, ListTree, History, FolderOpen,
} from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { cn } from '@/lib/utils'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import type { ProjectHeaderInfo } from './TaskPanel'
import type { TaskItem } from './types'

interface TaskPanelTaskHeaderProps {
  task: TaskItem
  workspaceId: string
  statuses: StatusOption[]
  members: AvatarParticipant[]
  onStatusChange?: (statusId: string | null) => void
  onDeadlineSet?: (date: Date) => void
  onDeadlineClear?: () => void
  deadlinePending: boolean
  onRename: (name: string) => void
  onSettingsOpen: () => void
  onClose: () => void
  onProjectClick?: () => void
  onOpenProjectInStack?: (project: ProjectHeaderInfo) => void
  resolvedProjectName: string | null
  toolbarRef: (node: HTMLDivElement | null) => void
  /** Текущий режим контента панели: тред или «Вся история» проекта */
  viewMode?: 'thread' | 'history' | 'documents'
  /** Переключатель «История» — undefined прячет кнопку (например, у треда без проекта) */
  onToggleHistory?: () => void
  /** Переключатель «Документы» — undefined прячет кнопку (у треда без проекта) */
  onToggleDocuments?: () => void
}

export function TaskPanelTaskHeader({
  task,
  workspaceId,
  statuses,
  members,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  deadlinePending,
  onRename,
  onSettingsOpen,
  onClose,
  onProjectClick,
  onOpenProjectInStack,
  resolvedProjectName,
  toolbarRef,
  viewMode = 'thread',
  onToggleHistory,
  onToggleDocuments,
}: TaskPanelTaskHeaderProps) {
  const router = useRouter()
  const isTask = task.type === 'task'
  const ThreadIcon = getChatIconComponent(task.icon)

  // Inline-редактирование
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const editNameRef = useRef<HTMLInputElement>(null)

  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setEditingName(false)
  }

  const startEditName = () => {
    setEditNameValue(task.name)
    setEditingName(true)
  }

  const commitEditName = () => {
    const trimmed = editNameValue.trim()
    if (trimmed && trimmed !== task.name) onRename(trimmed)
    setEditingName(false)
  }

  useEffect(() => {
    if (editingName && editNameRef.current) {
      editNameRef.current.focus()
      editNameRef.current.select()
    }
  }, [editingName])

  return (
    <div className="border-b shrink-0 h-[61px] flex flex-col">
      {/* Строка 1: статус/иконка + название + действия (жёсткая высота 30px) */}
      <div className="flex items-center gap-2 px-4 h-[30px] shrink-0">
        {viewMode === 'history' ? (
          <span className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
            <History className="w-4 h-4" />
          </span>
        ) : viewMode === 'documents' ? (
          <span className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
            <FolderOpen className="w-4 h-4" />
          </span>
        ) : isTask ? (
          <StatusDropdown
            currentStatus={statuses.find((s) => s.id === task.status_id) ?? null}
            statuses={statuses}
            onStatusChange={onStatusChange ?? (() => {})}
            size="md"
            disabled={!onStatusChange}
          />
        ) : (
          <span className="shrink-0 flex items-center justify-center w-6 h-6">
            {createElement(ThreadIcon, {
              className: cn('w-4 h-4', COLOR_TEXT[task.accent_color] ?? 'text-blue-500'),
            })}
          </span>
        )}

        {viewMode === 'history' ? (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0"
          >
            История
          </h2>
        ) : viewMode === 'documents' ? (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0"
          >
            Документы
          </h2>
        ) : editingName ? (
          <form
            className="flex items-center gap-1 min-w-0 flex-1"
            onSubmit={(e) => { e.preventDefault(); commitEditName() }}
          >
            <input
              ref={editNameRef}
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={commitEditName}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b-2 border-primary outline-none py-0"
            />
            <button type="submit" className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground">
              <Check className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0 cursor-pointer hover:text-primary transition-colors"
            onClick={startEditName}
          >
            {task.name}
          </h2>
        )}

        {task.project_id && resolvedProjectName && (
          <span className="shrink-0 text-muted-foreground/50 select-none" aria-hidden="true">
            •
          </span>
        )}

        {task.project_id && resolvedProjectName && (
          <a
            href={`/workspaces/${workspaceId}/projects/${task.project_id}`}
            onClick={(e) => {
              if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                onProjectClick?.()
                router.push(`/workspaces/${workspaceId}/projects/${task.project_id}`)
              }
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors shrink-0 min-w-0"
            title="Открыть проект"
          >
            <span className="truncate max-w-[200px]">{resolvedProjectName}</span>
            <ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
          </a>
        )}

        {isTask && (
          <div className="shrink-0">
            <AssigneesPopover
              threadId={task.id}
              projectId={task.project_id}
              workspaceId={workspaceId}
              assignees={members}
            />
          </div>
        )}

        {onDeadlineSet && onDeadlineClear && (
          <DeadlinePopover
            deadline={task.deadline}
            onSet={onDeadlineSet}
            onClear={onDeadlineClear}
            isPending={deadlinePending}
          />
        )}

        <div ref={toolbarRef} className="flex items-center gap-1 ml-auto shrink-0" />

        <button
          type="button"
          onClick={onSettingsOpen}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Настройки"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Строка 2: «Другие задачи» + «История» + «Документы» + дедлайн.
          Жёсткая высота 26px, фиксированный отступ слева = 48px (px-4 + w-6 + gap-2)
          — ровно под названием. Рендерится всегда, даже пустой. */}
      <div className="flex items-start gap-2 pr-4 pl-[48px] h-[26px] shrink-0">
          {task.project_id && onOpenProjectInStack && (
            <button
              type="button"
              onClick={() =>
                onOpenProjectInStack({
                  id: task.project_id!,
                  name: resolvedProjectName ?? 'Проект',
                })
              }
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] -ml-1.5 rounded text-xs font-medium transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              title="Другие задачи"
              aria-label="Другие задачи"
            >
              <ListTree className="w-3 h-3" />
              <span>Другие задачи</span>
            </button>
          )}

          {onToggleHistory && (
            <button
              type="button"
              onClick={onToggleHistory}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-xs font-medium transition-colors',
                viewMode === 'history'
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              title={viewMode === 'history' ? 'Вернуться к треду' : 'Вся история проекта'}
              aria-pressed={viewMode === 'history'}
            >
              <History className="w-3 h-3" />
              <span>История</span>
            </button>
          )}

          {onToggleDocuments && (
            <button
              type="button"
              onClick={onToggleDocuments}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-xs font-medium transition-colors',
                viewMode === 'documents'
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              title={viewMode === 'documents' ? 'Вернуться к треду' : 'Документы проекта'}
              aria-pressed={viewMode === 'documents'}
            >
              <FolderOpen className="w-3 h-3" />
              <span>Документы</span>
            </button>
          )}

      </div>
    </div>
  )
}
