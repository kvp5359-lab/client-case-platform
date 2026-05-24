"use client"

/**
 * Внутренний хук TaskPanel — серверные запросы (fullThread, projectThreads,
 * project meta, last-read-at), побочные эффекты (forward-цепочка, анимация
 * въезда, Escape-handler) и derived-значения (liveTask, projectItem).
 *
 * Главный компонент TaskPanel остаётся тонким: UI-state (settingsOpen,
 * viewMode, toolbarContainer) и JSX.
 *
 * Не путать с `useTaskPanelSetup` — тот живёт на стороне ПОТРЕБИТЕЛЕЙ
 * TaskPanel (TaskListView, InboxPage), управляет стеком и мутациями.
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectThreadById, useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { getCurrentProjectParticipant } from '@/services/api/messenger/messengerService'
import { messengerKeys } from '@/hooks/queryKeys'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { TaskItem, PanelStackItem } from './types'

type Params = {
  stackTop: PanelStackItem | null
  open: boolean
  bare: boolean
  viewMode: 'thread' | 'history' | 'documents'
  settingsOpen: boolean
  onClose: () => void
  onOpenThreadInStack?: (task: TaskItem) => void
}

export function useTaskPanelInternal({
  stackTop,
  open,
  bare,
  viewMode,
  settingsOpen,
  onClose,
  onOpenThreadInStack,
}: Params) {
  const { user } = useAuth()

  const task = stackTop?.kind === 'task' ? stackTop.task : null
  const projectItemRaw = stackTop?.kind === 'project' ? stackTop.project : null
  const mode: 'task' | 'project' | null = stackTop ? stackTop.kind : null

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
  // В bare-режиме внешний контейнер с анимацией предоставляет родитель
  // (TaskPanelTabbedShell), поэтому painted здесь не нужен — рендерим сразу.
  const [painted, setPainted] = useState(bare)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open && !bare) setPainted(false)
  }
  useEffect(() => {
    if (bare) return
    if (!open) return
    const id = requestAnimationFrame(() => setPainted(true))
    document.body.setAttribute('data-task-panel-open', '')
    return () => { cancelAnimationFrame(id); document.body.removeAttribute('data-task-panel-open') }
  }, [open, bare])
  const visible = bare ? true : open && painted

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

  return {
    user,
    task,
    mode,
    projectItem,
    projectThreads,
    resolvedProjectName,
    threadLastReadAt,
    fullThread,
    liveTask,
    visible,
  }
}
