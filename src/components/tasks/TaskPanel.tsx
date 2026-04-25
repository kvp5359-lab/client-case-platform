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
import { ArrowLeft } from 'lucide-react'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { AllHistoryContent } from '@/components/history/AllHistoryContent'
import { PanelDocumentsContent } from '@/components/documents/PanelDocumentsContent'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useProjectThreadById, useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { getCurrentProjectParticipant } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'
import { useSidePanelStore } from '@/store/sidePanelStore'
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
  /** Слот, который рендерится сверху панели (над шапкой). Используется для системы вкладок. */
  topSlot?: React.ReactNode
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
  topSlot,
}: TaskPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])
  const [viewMode, setViewMode] = useState<'thread' | 'history' | 'documents'>('thread')
  const { user } = useAuth()

  const task = stackTop?.kind === 'task' ? stackTop.task : null
  const projectItemRaw = stackTop?.kind === 'project' ? stackTop.project : null
  const mode: 'task' | 'project' | null = stackTop ? stackTop.kind : null

  // Сброс режима просмотра при смене треда в стеке
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setViewMode('thread')
  }

  // Треды проекта — нужны для «Всей истории» (рендер и переход по клику на чат)
  const { data: projectThreads = [] } = useProjectThreads(task?.project_id ?? undefined)

  // Пересылка сообщения в другой чат из TaskPanel: подхватываем pendingForwardMessage
  // и пушим целевой тред поверх стека. Сам pendingForwardMessage не трогаем — его
  // сконсумирует useMessengerState целевого треда (вставит цитату/вложения).
  const pendingForwardMessage = useSidePanelStore((s) => s.pendingForwardMessage)
  useEffect(() => {
    if (!open) return
    if (!pendingForwardMessage) return
    if (!onOpenThreadInStack) return
    const targetId = pendingForwardMessage.targetChatId
    // Если уже в целевом треде — ничего не делаем, цитата вставится сама.
    if (task?.id === targetId) return
    const t = projectThreads.find((x) => x.id === targetId)
    if (!t) return
    onOpenThreadInStack({
      id: t.id,
      name: t.name,
      type: t.type,
      project_id: t.project_id,
      workspace_id: t.workspace_id,
      status_id: t.status_id,
      deadline: t.deadline,
      accent_color: t.accent_color,
      icon: t.icon,
      is_pinned: t.is_pinned,
      created_at: t.created_at,
      sort_order: t.sort_order,
    })
  }, [pendingForwardMessage, open, task?.id, projectThreads, onOpenThreadInStack])

  // Карта last_read_at по тредам проекта — для красной рамки «непрочитано»
  // в бабблах «Всей истории». Загружаем только когда включён режим истории,
  // чтобы не делать лишних запросов при обычном просмотре треда.
  const historyActive = viewMode === 'history' && !!task?.project_id
  const { data: threadLastReadAt } = useQuery({
    queryKey: messengerKeys.lastReadAtByProject(task?.project_id ?? '', user?.id ?? ''),
    enabled: historyActive && !!user?.id && !!task?.project_id,
    queryFn: async () => {
      if (!task?.project_id || !user?.id) return new Map<string, string>()
      const participant = await getCurrentProjectParticipant(task.project_id, user.id)
      const pid = participant?.participantId
      if (!pid) return new Map<string, string>()
      const { data } = await supabase
        .from('message_read_status')
        .select('thread_id, last_read_at')
        .eq('participant_id', pid)
        .not('thread_id', 'is', null)
      const map = new Map<string, string>()
      for (const row of data ?? []) {
        if (row.thread_id && row.last_read_at) map.set(row.thread_id, row.last_read_at)
      }
      return map
    },
  })

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

  // Полный ProjectThread: используем и для диалога настроек, и для live-синхронизации
  // шапки панели с кешем (статус, дедлайн, имя, иконка, цвет могут меняться
  // из списка задач или через realtime — снимок в стеке это не ловит).
  const { data: fullThread } = useProjectThreadById(task?.id, !!task)

  const liveTask: TaskItem | null = task
    ? fullThread && fullThread.id === task.id
      ? {
          ...task,
          type: fullThread.type,
          name: fullThread.name,
          status_id: fullThread.status_id,
          deadline: fullThread.deadline,
          accent_color: fullThread.accent_color,
          icon: fullThread.icon,
          is_pinned: fullThread.is_pinned,
        }
      : task
    : null

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
        topSlot={topSlot}
      />
    )
    const portalRoot = document.getElementById('workspace-panel-root')
    return portalRoot ? createPortal(panel, portalRoot) : panel
  }

  // ── Режим 1: тред ──
  if (!task || !liveTask) return null

  // Единая точка «шаг назад»: из history/documents — обратно к треду, иначе — по стеку.
  const backAction =
    viewMode === 'history'
      ? () => setViewMode('thread')
      : viewMode === 'documents'
        ? () => setViewMode('thread')
        : canGoBack
          ? onBack
          : undefined

  const panel = (
    <>
      <div
        className={cn(
          'side-panel flex flex-col z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Плавающая круглая кнопка «Назад» — сидит на левой границе панели,
            не смещает содержимое шапки. Появляется и в стек-навигации
            (canGoBack), и при переключении viewMode на history/documents. */}
        {backAction && (
          <button
            type="button"
            onClick={backAction}
            className="absolute left-0 top-1 -translate-x-[60%] z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors"
            title={viewMode === 'thread' ? 'Назад' : 'Назад к треду'}
            aria-label="Назад"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {topSlot}

        <TaskPanelTaskHeader
          task={liveTask}
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
          onProjectClick={onProjectClick}
          onOpenProjectInStack={onOpenProjectInStack}
          resolvedProjectName={resolvedProjectName}
          toolbarRef={toolbarRef}
          viewMode={viewMode}
          onToggleHistory={
            task.project_id
              ? () => setViewMode((m) => (m === 'history' ? 'thread' : 'history'))
              : undefined
          }
          onToggleDocuments={
            task.project_id
              ? () => setViewMode((m) => (m === 'documents' ? 'thread' : 'documents'))
              : undefined
          }
        />

        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {viewMode === 'documents' && task.project_id ? (
            <PanelDocumentsContent
              projectId={task.project_id}
              workspaceId={workspaceId}
            />
          ) : viewMode === 'history' && task.project_id ? (
            <AllHistoryContent
              projectId={task.project_id}
              workspaceId={workspaceId}
              threads={projectThreads}
              currentUserId={user?.id}
              threadLastReadAt={threadLastReadAt}
              onOpenChat={(threadId) => {
                // Клик по тому же треду, что сейчас в стеке — просто закрываем историю.
                if (threadId === task.id) {
                  setViewMode('thread')
                  return
                }
                const t = projectThreads.find((x) => x.id === threadId)
                if (!t || !onOpenThreadInStack) {
                  setViewMode('thread')
                  return
                }
                // Пушим новый тред поверх стека. viewMode сбросится автоматически
                // через эффект смены task.id.
                onOpenThreadInStack({
                  id: t.id,
                  name: t.name,
                  type: t.type,
                  project_id: t.project_id,
                  workspace_id: t.workspace_id,
                  status_id: t.status_id,
                  deadline: t.deadline,
                  accent_color: t.accent_color,
                  icon: t.icon,
                  is_pinned: t.is_pinned,
                  created_at: t.created_at,
                  sort_order: t.sort_order,
                })
              }}
            />
          ) : (
            <MessengerTabContent
              projectId={task.project_id ?? undefined}
              workspaceId={workspaceId}
              threadId={task.id}
              accent={task.accent_color as never}
              toolbarPortalContainer={toolbarContainer}
            />
          )}
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
