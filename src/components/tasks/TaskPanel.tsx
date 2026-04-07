"use client"

/**
 * TaskPanel — правая боковая панель для просмотра задачи.
 * Открывается поверх основной правой панели (sidebar) с тем же размером.
 * Заменяет TaskDialog (модальное окно) для более удобного UX.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { CheckSquare, Pencil, Check, Settings, ExternalLink, X } from 'lucide-react'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { cn } from '@/lib/utils'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import type { TaskItem } from './types'

interface TaskPanelProps {
  task: TaskItem | null
  open: boolean
  onClose: () => void
  workspaceId: string
  statuses: StatusOption[]
  members: AvatarParticipant[]
  onStatusChange: (statusId: string | null) => void
  onDeadlineSet: (date: Date) => void
  onDeadlineClear: () => void
  onRename: (name: string) => void
  onSettingsSave: (params: { name: string; accent_color: string; icon: string }) => void
  deadlinePending: boolean
  settingsPending: boolean
  /** Показывать ссылку на проект (на странице «Все задачи») */
  showProjectLink?: boolean
  /** Callback при клике на ссылку проекта */
  onProjectClick?: () => void
}

export function TaskPanel({
  task,
  open,
  onClose,
  workspaceId,
  statuses,
  members,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onRename,
  onSettingsSave,
  deadlinePending,
  settingsPending,
  showProjectLink,
  onProjectClick,
}: TaskPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])

  // Inline-редактирование названия
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  const editNameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Анимация
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      // Форсим reflow для анимации
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open])

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Не закрываем если открыт settings dialog или какой-то popover
        if (settingsOpen) return
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, settingsOpen])

  const startEditName = () => {
    if (!task) return
    setEditNameValue(task.name)
    setEditingName(true)
  }

  useEffect(() => {
    if (editingName && editNameRef.current) {
      editNameRef.current.focus()
      editNameRef.current.select()
    }
  }, [editingName])

  const commitEditName = () => {
    const trimmed = editNameValue.trim()
    if (trimmed && task && trimmed !== task.name) {
      onRename(trimmed)
    }
    setEditingName(false)
  }

  // Сброс editing при смене задачи
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setEditingName(false)
  }

  if (!open || !task) return null

  const panel = (
    <>
      {/* Backdrop — невидимый кликабельный слой для закрытия */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
      />

      {/* Панель — позиционируется как основная правая панель в WorkspaceLayout */}
      <div
        ref={panelRef}
        className={cn(
          'absolute top-0 right-0 h-full w-[45%] min-w-[360px] border-l border-gray-200',
          'bg-white flex flex-col overflow-hidden shadow-[-2px_0_8px_rgba(0,0,0,0.08)] z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Шапка */}
        <div className="border-b shrink-0 py-1.5">
          {/* Строка 1: статус + название + закрыть */}
          <div className="flex items-center gap-2 px-4">
            {statuses.length > 0 ? (
              <StatusDropdown
                currentStatus={statuses.find((s) => s.id === task.status_id) ?? null}
                statuses={statuses}
                onStatusChange={onStatusChange}
                size="md"
              />
            ) : (
              <CheckSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
            )}

            {editingName ? (
              <form
                className="flex items-center gap-1 min-w-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  commitEditName()
                }}
              >
                <input
                  ref={editNameRef}
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onBlur={commitEditName}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  className="flex-1 min-w-0 text-base font-semibold bg-transparent border-b-2 border-primary outline-none py-0"
                />
                <button
                  type="submit"
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Check className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <h2
                className="text-base font-semibold truncate min-w-0 cursor-pointer hover:text-primary transition-colors group/title"
                onClick={startEditName}
              >
                {task.name}
                <Pencil className="w-3 h-3 ml-1.5 inline-block opacity-0 group-hover/title:opacity-50 transition-opacity" />
              </h2>
            )}

            <div className="shrink-0">
              <AssigneesPopover
                threadId={task.id}
                projectId={task.project_id}
                workspaceId={workspaceId}
                assignees={members}
              />
            </div>

            <div ref={toolbarRef} className="flex items-center gap-1 ml-auto shrink-0" />

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Настройки задачи"
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

          {/* Строка 2: проект, срок */}
          <div className="flex items-center gap-2 px-4 -mt-1">
            {/* Спейсер — ширина иконки статуса, чтобы выровнять под название */}
            <div className="w-[26px] shrink-0" />
            {showProjectLink && task.project_name && (
              <button
                type="button"
                onClick={onProjectClick}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                title="Открыть проект"
              >
                <span className="truncate max-w-[120px]">{task.project_name}</span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </button>
            )}

            <DeadlinePopover
              deadline={task.deadline}
              onSet={onDeadlineSet}
              onClear={onDeadlineClear}
              isPending={deadlinePending}
            />
          </div>
        </div>

        {/* Контент — мессенджер */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <MessengerTabContent
            projectId={task.project_id ?? undefined}
            workspaceId={workspaceId}
            threadId={task.id}
            accent={task.accent_color as never}
            toolbarPortalContainer={toolbarContainer}
          />
        </div>
      </div>

      {/* Настройки задачи */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={task as unknown as import('@/hooks/messenger/useProjectThreads').ProjectThread}
            workspaceId={workspaceId}
            projectId={task?.project_id ?? undefined}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onUpdate={(params) => {
              onSettingsSave(params)
              setSettingsOpen(false)
            }}
            isPending={settingsPending}
          />
        </Suspense>
      )}
    </>
  )

  return panel
}
