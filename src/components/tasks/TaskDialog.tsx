"use client"

/**
 * TaskDialog — диалог просмотра задачи с мессенджером.
 * Переиспользуется в TasksTabContent и TasksPage.
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import { CheckSquare, Pencil, Check, Settings, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'

// Lazy-load: ChatSettingsDialog тянет Tiptap через ComposeField.
const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)
import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import type { TaskItem } from './types'

interface TaskDialogProps {
  task: TaskItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function TaskDialog({
  task,
  open,
  onOpenChange,
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
}: TaskDialogProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])

  // Inline-редактирование названия
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  const editNameRef = useRef<HTMLInputElement>(null)

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

  // Сброс editing при смене задачи (React-рекомендуемый паттерн: adjust state during render)
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setEditingName(false)
  }

  if (!task) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0">
          <div className="border-b shrink-0 pr-12">
            {/* Строка 1: статус + название */}
            <div className="flex items-center gap-2 px-5 pt-2.5 pb-1">
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
                <DialogTitle
                  className="text-base font-semibold truncate min-w-0 cursor-pointer hover:text-primary transition-colors group/title"
                  onClick={startEditName}
                >
                  {task.name}
                  <Pencil className="w-3 h-3 ml-1.5 inline-block opacity-0 group-hover/title:opacity-50 transition-opacity" />
                </DialogTitle>
              )}
            </div>

            {/* Строка 2: проект, срок, исполнители, тулбар, настройки */}
            <div className="flex items-center gap-2 px-5 pb-2 pl-12">
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

              <AssigneesPopover
                threadId={task.id}
                projectId={task.project_id}
                workspaceId={workspaceId}
                assignees={members}
              />

              <div ref={toolbarRef} className="flex items-center gap-1 ml-auto shrink-0" />

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Настройки задачи"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          <DialogDescription className="sr-only">Переписка по задаче {task.name}</DialogDescription>

          <div className="flex-1 min-h-0 overflow-hidden">
            <MessengerTabContent
              projectId={task.project_id ?? undefined}
              workspaceId={workspaceId}
              threadId={task.id}
              accent={task.accent_color as never}
              toolbarPortalContainer={toolbarContainer}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Настройки задачи — монтируется только когда открыт */}
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
}
