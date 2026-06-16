"use client"

/**
 * Тулбар пакетных действий для item_lists — единое меню «Действия».
 * Показывается, когда выделено хотя бы одно элемент. При смешанной выборке
 * (в треды-списке выбраны task + chat) действия, неприменимые ко всем —
 * задизейблены с подсказкой о причине.
 *
 * Набор:
 *   - Треды (task): сменить статус, архив.
 *   - Проекты: сменить статус, добавить/отстранить исполнителей, архив.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { useQueryClient } from '@tanstack/react-query'
import { workspaceThreadKeys, accessibleProjectKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { useMarkThreadReadIfFinal } from '@/hooks/messenger/useMarkThreadReadIfFinal'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import type { PickerParticipant } from '@/components/participants/ParticipantsPicker'
import { AddExecutorsDialog } from './AddExecutorsDialog'
import { RemoveExecutorDialog } from './RemoveExecutorDialog'
import { BulkRemovePeopleDialog } from './BulkRemovePeopleDialog'
import { BulkDeadlineDialog } from './BulkDeadlineDialog'
import { addExecutors, removeExecutor, removeAllExecutors } from './bulkExecutorActions'
import {
  addThreadAssignees,
  removeAllThreadAssignees,
  removeThreadAssignees,
  removeThreadMembers,
  loadAssigneesOfThreads,
  loadMembersOfThreads,
  setThreadsDeadline,
} from './bulkThreadActions'

type BulkActionsBarProps = {
  entityType: 'thread' | 'project'
  selectedIds: Set<string>
  onClearSelection: () => void
  workspaceId: string
  items: Array<WorkspaceTask | BoardProject>
  taskStatuses?: StatusOption[]
  projectStatuses?: StatusOption[]
}

export function BulkActionsBar({
  entityType,
  selectedIds,
  onClearSelection,
  workspaceId,
  items,
  taskStatuses = [],
  projectStatuses = [],
}: BulkActionsBarProps) {
  const qc = useQueryClient()
  const markReadIfFinal = useMarkThreadReadIfFinal()
  const [pending, setPending] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  // Thread-диалоги
  const [addAssigneesOpen, setAddAssigneesOpen] = useState(false)
  const [removeAssigneesOpen, setRemoveAssigneesOpen] = useState(false)
  const [removeMembersOpen, setRemoveMembersOpen] = useState(false)
  const [deadlineOpen, setDeadlineOpen] = useState(false)

  const { data: rawParticipants = [] } = useWorkspaceParticipants(workspaceId)
  const workspaceParticipants: PickerParticipant[] = rawParticipants.map((p) => ({
    id: p.id,
    name: p.name,
    last_name: p.last_name,
    avatar_url: p.avatar_url,
    user_id: p.user_id,
    workspace_roles: p.workspace_roles ?? undefined,
  }))

  const selectedItems = items.filter((it) => selectedIds.has(it.id))
  const projectIds = selectedItems.map((it) => it.id)
  const threadIds = selectedItems.map((it) => it.id)

  // Для тредов — есть ли в выделении не-task (чат/email)? Если да, операции,
  // относящиеся только к task, дизейблятся.
  const mixedThreadTypes =
    entityType === 'thread' &&
    selectedItems.some((it) => (it as WorkspaceTask).type && (it as WorkspaceTask).type !== 'task')

  const refresh = () => {
    if (entityType === 'thread') {
      qc.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })
      invalidateMessengerCaches(qc, workspaceId)
    } else {
      qc.invalidateQueries({ queryKey: accessibleProjectKeys.workspace(workspaceId) })
    }
  }

  // Инвалидация карт исполнителей (аватарки в колонке) после пакетных правок.
  const refreshAssignees = () => {
    qc.invalidateQueries({ queryKey: ['task-assignees-map'] })
    qc.invalidateQueries({ queryKey: ['task-assignees'] })
  }

  // ── Пакетные thread-действия ──────────────────────────────────────────────
  const runThread = async (fn: () => Promise<void>, okMsg: string, closers: Array<() => void> = []) => {
    setPending(true)
    try {
      await fn()
      toast.success(okMsg)
      closers.forEach((c) => c())
      refresh()
      refreshAssignees()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось выполнить действие')
    } finally {
      setPending(false)
    }
  }

  const handleAddThreadAssignees = (participantIds: string[]) =>
    runThread(
      () => addThreadAssignees(threadIds, participantIds),
      `Исполнители добавлены в ${threadIds.length}`,
      [() => setAddAssigneesOpen(false)],
    )

  const handleRemoveAllThreadAssignees = () => {
    if (!confirm(`Отстранить всех исполнителей из ${threadIds.length} тредов?`)) return
    runThread(() => removeAllThreadAssignees(threadIds), 'Все исполнители отстранены')
  }

  const handleRemoveThreadAssignees = (participantIds: string[]) =>
    runThread(
      () => removeThreadAssignees(threadIds, participantIds),
      'Исполнители отстранены',
      [() => setRemoveAssigneesOpen(false)],
    )

  const handleRemoveThreadMembers = (participantIds: string[]) =>
    runThread(
      () => removeThreadMembers(threadIds, participantIds),
      'Доступ закрыт',
      [() => setRemoveMembersOpen(false)],
    )

  const handleSetDeadline = (deadline: string | null) =>
    runThread(
      () => setThreadsDeadline(threadIds, deadline),
      deadline ? `Срок установлен у ${threadIds.length}` : `Срок снят у ${threadIds.length}`,
      [() => setDeadlineOpen(false)],
    )

  const setThreadStatus = async (statusId: string | null) => {
    setPending(true)
    try {
      const targets = selectedItems
        .filter((it) => (it as WorkspaceTask).type !== 'chat') as WorkspaceTask[]
      if (targets.length === 0) {
        toast.info('Среди выделенных нет задач — статус устанавливать некому')
        return
      }
      const ids = targets.map((t) => t.id)
      const { error } = await supabase
        .from('project_threads')
        .update({ status_id: statusId })
        .in('id', ids)
      if (error) throw error

      // Если новый статус финальный — помечаем каждый тред прочитанным.
      // Внутри хелпер сам проверит is_final, но мы делаем это последовательно,
      // чтобы кэш-патчи на inbox v2 не конкурировали друг с другом.
      for (const t of targets) {
        await markReadIfFinal({
          threadId: t.id,
          statusId,
          projectId: t.project_id,
          workspaceId: t.workspace_id,
        })
      }

      toast.success(`Статус обновлён у ${ids.length}`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить статус')
    } finally {
      setPending(false)
    }
  }

  const setProjectStatus = async (statusId: string) => {
    setPending(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status_id: statusId })
        .in('id', projectIds)
      if (error) throw error
      toast.success(`Статус обновлён у ${projectIds.length} проектов`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить статус')
    } finally {
      setPending(false)
    }
  }

  const archive = async () => {
    setPending(true)
    try {
      const ids = selectedItems.map((it) => it.id)
      // Динамическое имя таблицы ломает вывод типа .update() (supabase-js даёт
      // never на union-таблице). Ветвим на литералы — обе таблицы имеют
      // is_deleted/deleted_at, проверка колонок сохраняется.
      const patch = { is_deleted: true, deleted_at: new Date().toISOString() }
      const { error } = entityType === 'thread'
        ? await supabase.from('project_threads').update(patch).in('id', ids)
        : await supabase.from('projects').update(patch).in('id', ids)
      if (error) throw error
      toast.success(`В корзину перенесено: ${ids.length}`)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось архивировать')
    } finally {
      setPending(false)
    }
  }

  // ── Исполнители (только проекты) ──────────────────────────────────────────
  const handleAddExecutors = async (participantIds: string[]) => {
    setPending(true)
    try {
      await addExecutors(projectIds, participantIds)
      toast.success(`Исполнители добавлены в ${projectIds.length} проектов`)
      setAddOpen(false)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить исполнителей')
    } finally {
      setPending(false)
    }
  }

  const handleRemoveExecutor = async (participantId: string) => {
    setPending(true)
    try {
      await removeExecutor(projectIds, participantId)
      toast.success('Исполнитель отстранён')
      setRemoveOpen(false)
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отстранить исполнителя')
    } finally {
      setPending(false)
    }
  }

  const handleRemoveAllExecutors = async () => {
    if (!confirm(`Отстранить всех исполнителей из ${projectIds.length} проектов?`)) return
    setPending(true)
    try {
      await removeAllExecutors(projectIds)
      toast.success('Все исполнители отстранены')
      refresh()
      onClearSelection()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отстранить исполнителей')
    } finally {
      setPending(false)
    }
  }

  const statusOptions = entityType === 'thread' ? taskStatuses : projectStatuses
  const statusDisabled = entityType === 'thread' && mixedThreadTypes

  return (
    <>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            Действия
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          {/* Сменить статус */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              disabled={statusDisabled}
              title={
                statusDisabled
                  ? 'Среди выделенных есть чаты/email — у них нет статуса. Оставьте только задачи.'
                  : undefined
              }
            >
              Сменить статус
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[300px] overflow-y-auto">
              {statusOptions.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() =>
                    entityType === 'thread' ? setThreadStatus(s.id) : setProjectStatus(s.id)
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full mr-2 inline-block"
                    style={{ backgroundColor: s.color ?? '#6B7280' }}
                  />
                  {s.name}
                </DropdownMenuItem>
              ))}
              {entityType === 'thread' && (
                <DropdownMenuItem
                  onClick={() => setThreadStatus(null)}
                  className="text-muted-foreground"
                >
                  Без статуса
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Треды: исполнители, участники, срок */}
          {entityType === 'thread' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAddAssigneesOpen(true)}>
                Добавить исполнителей
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRemoveAssigneesOpen(true)}>
                Отстранить конкретных исполнителей
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRemoveAllThreadAssignees}>
                Отстранить всех исполнителей
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRemoveMembersOpen(true)}>
                Убрать из участников (закрыть доступ)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDeadlineOpen(true)}>
                Установить срок
              </DropdownMenuItem>
            </>
          )}

          {/* Исполнители — только для проектов */}
          {entityType === 'project' && (
            <>
              <DropdownMenuItem onClick={() => setAddOpen(true)}>
                Добавить исполнителей
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRemoveOpen(true)}>
                Отстранить исполнителя
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRemoveAllExecutors}>
                Отстранить всех исполнителей
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              if (!confirm(`Перенести ${selectedIds.size} в корзину?`)) return
              archive()
            }}
          >
            В корзину
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {entityType === 'project' && (
        <>
          <AddExecutorsDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            participants={workspaceParticipants}
            projectCount={projectIds.length}
            pending={pending}
            onConfirm={handleAddExecutors}
          />
          <RemoveExecutorDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            projectIds={projectIds}
            pending={pending}
            onConfirm={handleRemoveExecutor}
          />
        </>
      )}

      {entityType === 'thread' && (
        <>
          <AddExecutorsDialog
            open={addAssigneesOpen}
            onOpenChange={setAddAssigneesOpen}
            participants={workspaceParticipants}
            projectCount={threadIds.length}
            pending={pending}
            onConfirm={handleAddThreadAssignees}
            description={`Выбранные участники станут исполнителями ${threadIds.length} выделенных тредов.`}
          />
          <BulkRemovePeopleDialog
            open={removeAssigneesOpen}
            onOpenChange={setRemoveAssigneesOpen}
            title="Отстранить исполнителей"
            description="Снимутся выбранные исполнители со всех выделенных тредов."
            loader={() => loadAssigneesOfThreads(threadIds)}
            pending={pending}
            onConfirm={handleRemoveThreadAssignees}
          />
          <BulkRemovePeopleDialog
            open={removeMembersOpen}
            onOpenChange={setRemoveMembersOpen}
            title="Убрать из участников"
            description="Выбранные потеряют доступ к просмотру выделенных тредов и их переписки."
            loader={() => loadMembersOfThreads(threadIds)}
            pending={pending}
            onConfirm={handleRemoveThreadMembers}
          />
          <BulkDeadlineDialog
            open={deadlineOpen}
            onOpenChange={setDeadlineOpen}
            count={threadIds.length}
            pending={pending}
            onConfirm={handleSetDeadline}
          />
        </>
      )}
    </>
  )
}
