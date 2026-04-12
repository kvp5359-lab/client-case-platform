"use client"

/**
 * TaskPanel — правая боковая панель для просмотра треда или проекта.
 *
 * ── Два режима ──
 * Режим 1 (task): шапка + MessengerTabContent.
 * Режим 2 (project): шапка + TaskListView проекта.
 *
 * Подкомпоненты:
 * - TaskPanelProjectView — режим 2 целиком
 * - TaskPanelTaskHeader — шапка режима 1
 */

import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useProjectThreadById } from '@/hooks/messenger/useProjectThreads'
import { TaskPanelProjectView } from './TaskPanelProjectView'
import { TaskPanelTaskHeader } from './TaskPanelTaskHeader'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { TaskItem } from './types'

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

/** Минимальная информация о проекте для шапки Режима 2. */
export interface ProjectHeaderInfo {
  id: string
  name: string
  created_at?: string | null
  description?: string | null
}

/** Элемент стека панели: либо задача, либо проект. */
export type PanelStackItem =
  | { kind: 'task'; task: TaskItem }
  | { kind: 'project'; project: ProjectHeaderInfo }

export interface TaskPanelProps {
  stackTop: PanelStackItem | null
  open: boolean
  onClose: () => void
  workspaceId: string
  statuses?: StatusOption[]
  members?: AvatarParticipant[]
  onStatusChange?: (statusId: string | null) => void
  onDeadlineSet?: (date: Date) => void
  onDeadlineClear?: () => void
  onRename: (name: string) => void
  onSettingsSave: (params: { name: string; accent_color: string; icon: string }) => void
  deadlinePending?: boolean
  settingsPending: boolean
  showProjectLink?: boolean
  onProjectClick?: () => void
  onBack?: () => void
  canGoBack?: boolean
  onOpenThreadInStack?: (task: TaskItem) => void
  onOpenProjectInStack?: (project: ProjectHeaderInfo) => void
}

export function TaskPanel({
  stackTop,
  open,
  onClose,
  workspaceId,
  statuses = [],
  members = [],
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onRename,
  onSettingsSave,
  deadlinePending = false,
  settingsPending,
  onProjectClick,
  onBack,
  canGoBack = false,
  onOpenThreadInStack,
  onOpenProjectInStack,
}: TaskPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])
  const [titleOffset, setTitleOffset] = useState(0)

  const task = stackTop?.kind === 'task' ? stackTop.task : null
  const projectItemRaw = stackTop?.kind === 'project' ? stackTop.project : null
  const mode: 'task' | 'project' | null = stackTop ? stackTop.kind : null

  // ── Ленивая подгрузка мета-данных проекта ──
  const [fetchedProjectMeta, setFetchedProjectMeta] = useState<{
    id: string; created_at: string | null; description: string | null
  } | null>(null)
  const needProjectMeta =
    projectItemRaw !== null &&
    (projectItemRaw.created_at === undefined || projectItemRaw.description === undefined)
  useEffect(() => {
    if (!needProjectMeta || !projectItemRaw) return
    if (fetchedProjectMeta?.id === projectItemRaw.id) return
    let cancelled = false
    supabase
      .from('projects')
      .select('id, created_at, description')
      .eq('id', projectItemRaw.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setFetchedProjectMeta({ id: data.id, created_at: data.created_at, description: data.description })
      })
    return () => { cancelled = true }
  }, [needProjectMeta, projectItemRaw, fetchedProjectMeta?.id])

  const projectItem = projectItemRaw
    ? {
        ...projectItemRaw,
        created_at: projectItemRaw.created_at ?? (fetchedProjectMeta?.id === projectItemRaw.id ? fetchedProjectMeta.created_at : null),
        description: projectItemRaw.description ?? (fetchedProjectMeta?.id === projectItemRaw.id ? fetchedProjectMeta.description : null),
      }
    : null

  // ── Ленивая подгрузка project_name для задачи ──
  const [fetchedProjectName, setFetchedProjectName] = useState<string | null>(null)
  useEffect(() => {
    if (!task?.project_id || task.project_name) return
    let cancelled = false
    supabase.from('projects').select('name').eq('id', task.project_id).single()
      .then(({ data }) => { if (!cancelled) setFetchedProjectName(data?.name ?? null) })
    return () => { cancelled = true }
  }, [task?.project_id, task?.project_name])
  const resolvedProjectName = task?.project_name ?? (task?.project_id ? fetchedProjectName : null)

  // ── Анимация въезда ──
  const [painted, setPainted] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) setPainted(false)
  }
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setPainted(true))
    document.body.setAttribute('data-task-panel-open', '')
    return () => { cancelAnimationFrame(id); document.body.removeAttribute('data-task-panel-open') }
  }, [open])
  const visible = open && painted

  // ── Escape ──
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsOpen) return
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, settingsOpen])

  // Полный ProjectThread для настроек
  const { data: fullThread } = useProjectThreadById(task?.id, settingsOpen)

  if (!open || !stackTop) return null

  // ── Режим 2: проект ──
  if (mode === 'project' && projectItem) {
    const panel = (
      <TaskPanelProjectView
        project={projectItem}
        workspaceId={workspaceId}
        visible={visible}
        canGoBack={canGoBack}
        onBack={onBack}
        onClose={onClose}
        onOpenThreadInStack={onOpenThreadInStack}
      />
    )
    const portalRoot = document.getElementById('workspace-panel-root')
    return portalRoot ? createPortal(panel, portalRoot) : panel
  }

  // ── Режим 1: тред ──
  if (!task) return null

  const panel = (
    <>
      <div
        className={cn(
          'side-panel flex flex-col z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <TaskPanelTaskHeader
          task={task}
          workspaceId={workspaceId}
          statuses={statuses}
          members={members}
          onStatusChange={onStatusChange}
          onDeadlineSet={onDeadlineSet}
          onDeadlineClear={onDeadlineClear}
          deadlinePending={deadlinePending}
          onRename={onRename}
          onSettingsOpen={() => setSettingsOpen(true)}
          onClose={onClose}
          onBack={onBack}
          canGoBack={canGoBack}
          onProjectClick={onProjectClick}
          onOpenProjectInStack={onOpenProjectInStack}
          resolvedProjectName={resolvedProjectName}
          toolbarRef={toolbarRef}
          onTitleOffsetChange={setTitleOffset}
          titleOffset={titleOffset}
        />

        <div className="flex-1 min-h-0 overflow-hidden relative">
          <MessengerTabContent
            projectId={task.project_id ?? undefined}
            workspaceId={workspaceId}
            threadId={task.id}
            accent={task.accent_color as never}
            toolbarPortalContainer={toolbarContainer}
          />
        </div>
      </div>

      {settingsOpen && fullThread && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={fullThread}
            workspaceId={workspaceId}
            projectId={fullThread.project_id ?? undefined}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onUpdate={(params) => { onSettingsSave(params); setSettingsOpen(false) }}
            isPending={settingsPending}
          />
        </Suspense>
      )}
    </>
  )

  const portalRoot = document.getElementById('workspace-panel-root')
  return portalRoot ? createPortal(panel, portalRoot) : panel
}
