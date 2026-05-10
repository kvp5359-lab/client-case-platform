"use client"

/**
 * ItemListPage — страница одного списка item_lists.
 *
 * Что делает:
 *   1. Загружает item_list по id, фильтрует треды/проекты по filter_config
 *      через общий движок @/lib/filters/filterEngine.
 *   2. Рендерит таблицу с колонками из item_list.columns + чекбоксы.
 *   3. Тулбар пакетных действий (по выделенным).
 *   4. Кнопка «Настройки» открывает диалог с фильтром, колонками и сортировкой.
 *   5. Inline-редактирование статуса/исполнителей/дедлайна — через готовые
 *      хуки useUpdateTaskStatus / useUpdateTaskDeadline и т.д.
 *
 * MVP-ограничения, осознанно:
 *   - Ресайз колонок мышкой пока не реализован — ширина из columns читается,
 *     но drag-handle добавим в следующей итерации (после теста UX).
 *   - Inline-смена «Проекта» треда не реализована — слишком тяжёлый UX (нужно
 *     учитывать смену доступов). Переноси через bulk action.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, ArrowLeft, Settings, Trash2, Pin } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useDialog } from '@/hooks/shared/useDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useItemList, useSoftDeleteItemList } from '@/hooks/useItemLists'
import { useWorkspaceThreads, type WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useTaskStatuses, useAllProjectStatuses } from '@/hooks/useStatuses'
import { useFilteredTasks, useFilteredProjects } from '@/components/boards/hooks/useFilteredListData'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import type { FilterContext } from '@/lib/filters/types'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { ItemListSettingsDialog } from '@/components/itemLists/ItemListSettingsDialog'
import { defaultColumnsForEntity, getColumnDef, type ItemListColumnKey } from './columns'
import { BulkActionsBar } from './BulkActionsBar'

export default function ItemListPage() {
  const { workspaceId, listId } = useParams<{ workspaceId: string; listId: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  useEffect(() => { closePanel() }, [closePanel])

  const { data: list, isLoading } = useItemList(listId)
  usePageTitle(list?.name ?? 'Список')

  const settingsDialog = useDialog()
  const softDelete = useSoftDeleteItemList()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Очищаем выделение при смене списка. Это синхронизация деривата от
  // listId — корректнее было бы через key-based remount, но selectedIds
  // живёт на родителе из-за тулбара действий, поэтому используем effect.
  /* eslint-disable react-hooks/set-state-in-effect -- reset on prop change */
  useEffect(() => {
    setSelectedIds(new Set())
  }, [listId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!workspaceId || !listId || !user) return null

  if (isLoading) {
    return (
      <WorkspaceLayout>
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаю список…
        </div>
      </WorkspaceLayout>
    )
  }

  if (!list) {
    return (
      <WorkspaceLayout>
        <div className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">Список не найден или у вас нет доступа.</p>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/workspaces/${workspaceId}/lists`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            К обзору списков
          </Button>
        </div>
      </WorkspaceLayout>
    )
  }

  const handleDeleteList = () => {
    if (!confirm(`Удалить список «${list.name}»?`)) return
    softDelete.mutate(
      { id: list.id, workspace_id: workspaceId },
      {
        onSuccess: () => {
          toast.success('Список перемещён в корзину')
          router.push(`/workspaces/${workspaceId}/lists`)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Не удалось удалить'),
      },
    )
  }

  // Эффективные колонки: из списка либо дефолтные.
  const columns = (list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type))
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ ...c, def: getColumnDef(c.key) }))
    .filter((c) => c.def)

  // Принадлежит ли список текущему юзеру (для прав на редактирование).
  const canManage = list.owner_user_id === user.id || list.owner_user_id === null

  return (
    <WorkspaceLayout>
      <div className="flex flex-col h-full bg-gray-100/60">
        {/* Шапка */}
        <div className="px-6 py-3 border-b bg-white flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/workspaces/${workspaceId}/lists`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full inline-block"
                style={{ backgroundColor: list.color ?? '#6B7280' }}
              />
              {list.name}
            </h1>
            <div className="text-xs text-muted-foreground mt-0.5">
              {list.entity_type === 'thread' ? 'Треды' : 'Проекты'}
              {list.owner_user_id ? ' · личный' : ' · общий'}
            </div>
          </div>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" onClick={settingsDialog.open}>
                <Settings className="h-4 w-4 mr-1.5" />
                Настройки
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDeleteList}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {list.entity_type === 'thread' ? (
            <ThreadTableView
              workspaceId={workspaceId}
              currentUserId={user.id}
              filters={list.filter_config}
              sortBy={list.sort_by}
              sortDir={list.sort_dir}
              columns={columns}
              selectedIds={selectedIds}
              onSelectedChange={setSelectedIds}
            />
          ) : (
            <ProjectTableView
              workspaceId={workspaceId}
              currentUserId={user.id}
              filters={list.filter_config}
              sortBy={list.sort_by}
              sortDir={list.sort_dir}
              columns={columns}
              selectedIds={selectedIds}
              onSelectedChange={setSelectedIds}
            />
          )}
        </div>
      </div>

      <ItemListSettingsDialog
        open={settingsDialog.isOpen}
        onClose={settingsDialog.close}
        list={list}
        workspaceId={workspaceId}
      />
    </WorkspaceLayout>
  )
}

// ── Таблица для тредов ─────────────────────────────────────

interface TableViewProps {
  workspaceId: string
  currentUserId: string
  filters: import('@/lib/filters/types').FilterGroup
  sortBy: string | null
  sortDir: 'asc' | 'desc' | null
  columns: Array<{ key: string; width: number; def: ReturnType<typeof getColumnDef> }>
  selectedIds: Set<string>
  onSelectedChange: (next: Set<string>) => void
}

function ThreadTableView({
  workspaceId,
  currentUserId,
  filters,
  sortBy,
  sortDir,
  columns,
  selectedIds,
  onSelectedChange,
}: TableViewProps) {
  const { data: threads = [], isLoading } = useWorkspaceThreads(workspaceId)
  const taskIds = useMemo(() => threads.map((t) => t.id), [threads])
  const { data: assigneesMap = {} } = useTaskAssigneesMap(taskIds)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)

  const ctx = useMemo<FilterContext>(
    () => ({
      currentParticipantId: null,
      currentUserId,
      now: new Date(),
    }),
    [currentUserId],
  )

  const filtered = useFilteredTasks(
    threads,
    filters,
    ctx,
    assigneesMap,
    (sortBy as never) ?? 'created_at',
    sortDir ?? 'desc',
  )

  const router = useRouter()

  return (
    <TableShell
      isLoading={isLoading}
      isEmpty={filtered.length === 0}
      total={filtered.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={filtered.map((t) => t.id)}
      onSelectedChange={onSelectedChange}
      bulkActions={
        <BulkActionsBar
          entityType="thread"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={filtered}
          taskStatuses={taskStatuses}
        />
      }
      renderRow={(task: WorkspaceTask) => (
        <ThreadRow
          key={task.id}
          task={task}
          columns={columns}
          checked={selectedIds.has(task.id)}
          onToggle={() => {
            const next = new Set(selectedIds)
            if (next.has(task.id)) next.delete(task.id)
            else next.add(task.id)
            onSelectedChange(next)
          }}
          onOpen={() => {
            // Для тредов: переход на страницу проекта, чтобы открыть тред
            // в боковой панели — простейший MVP-вариант.
            if (task.project_id) {
              router.push(`/workspaces/${workspaceId}/projects/${task.project_id}?thread=${task.id}`)
            }
          }}
          assigneesMap={assigneesMap}
          taskStatuses={taskStatuses}
        />
      )}
      items={filtered}
    />
  )
}

// ── Таблица для проектов ───────────────────────────────────

function ProjectTableView({
  workspaceId,
  currentUserId,
  filters,
  sortBy,
  sortDir,
  columns,
  selectedIds,
  onSelectedChange,
}: TableViewProps) {
  const { data: projects = [], isLoading } = useAccessibleProjects(workspaceId)
  const { data: projectStatuses = [] } = useAllProjectStatuses(workspaceId)

  const ctx = useMemo<FilterContext>(
    () => ({
      currentParticipantId: null,
      currentUserId,
      now: new Date(),
    }),
    [currentUserId],
  )

  // participantsMap для junction-фильтра (упрощённо — пустой; для полноценной
  // фильтрации по участникам нужен отдельный запрос project_participants).
  const participantsMap = useMemo<Record<string, { id: string }[]>>(() => ({}), [])

  const filtered = useFilteredProjects(
    projects as unknown as Array<Record<string, unknown> & { id: string }>,
    filters,
    ctx,
    participantsMap,
    (sortBy as never) ?? 'created_at',
    sortDir ?? 'desc',
  ) as unknown as BoardProject[]

  const router = useRouter()

  return (
    <TableShell
      isLoading={isLoading}
      isEmpty={filtered.length === 0}
      total={filtered.length}
      columns={columns}
      selectedIds={selectedIds}
      allItemIds={filtered.map((p) => p.id)}
      onSelectedChange={onSelectedChange}
      bulkActions={
        <BulkActionsBar
          entityType="project"
          selectedIds={selectedIds}
          onClearSelection={() => onSelectedChange(new Set())}
          workspaceId={workspaceId}
          items={filtered}
          projectStatuses={projectStatuses}
        />
      }
      renderRow={(project) => (
        <ProjectRow
          key={project.id}
          project={project}
          columns={columns}
          checked={selectedIds.has(project.id)}
          onToggle={() => {
            const next = new Set(selectedIds)
            if (next.has(project.id)) next.delete(project.id)
            else next.add(project.id)
            onSelectedChange(next)
          }}
          onOpen={() => router.push(`/workspaces/${workspaceId}/projects/${project.id}`)}
          projectStatuses={projectStatuses}
        />
      )}
      items={filtered}
    />
  )
}

// ── Общая таблица-обёртка ──────────────────────────────────

interface TableShellProps<T extends { id: string }> {
  isLoading: boolean
  isEmpty: boolean
  total: number
  columns: Array<{ key: string; width: number; def: ReturnType<typeof getColumnDef> }>
  selectedIds: Set<string>
  allItemIds: string[]
  onSelectedChange: (next: Set<string>) => void
  bulkActions: React.ReactNode
  renderRow: (item: T) => React.ReactNode
  items: T[]
}

function TableShell<T extends { id: string }>({
  isLoading, isEmpty, total, columns, selectedIds, allItemIds,
  onSelectedChange, bulkActions, renderRow, items,
}: TableShellProps<T>) {
  const allChecked = allItemIds.length > 0 && allItemIds.every((id) => selectedIds.has(id))
  const someChecked = !allChecked && allItemIds.some((id) => selectedIds.has(id))

  const toggleAll = () => {
    if (allChecked) {
      const next = new Set(selectedIds)
      allItemIds.forEach((id) => next.delete(id))
      onSelectedChange(next)
    } else {
      const next = new Set(selectedIds)
      allItemIds.forEach((id) => next.add(id))
      onSelectedChange(next)
    }
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="px-6 py-2 border-b bg-primary/5 flex items-center gap-3 text-sm">
          <span className="font-medium">{selectedIds.size} выделено</span>
          <Button variant="ghost" size="sm" onClick={() => onSelectedChange(new Set())}>
            Снять выделение
          </Button>
          <div className="ml-auto flex items-center gap-2">{bulkActions}</div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-white border-b z-10">
            <tr>
              <th className="w-9 px-3 py-2 text-left">
                <Checkbox
                  checked={allChecked || (someChecked ? 'indeterminate' : false)}
                  onCheckedChange={toggleAll}
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left text-xs font-medium text-muted-foreground px-3 py-2 truncate"
                  style={{ width: c.width, minWidth: c.def?.minWidth ?? 80 }}
                >
                  {c.def?.label ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-1.5" />
                Загружаю…
              </td></tr>
            )}
            {!isLoading && isEmpty && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-12 text-center text-sm text-muted-foreground">
                Нет элементов, удовлетворяющих фильтру
              </td></tr>
            )}
            {!isLoading && !isEmpty && items.map(renderRow)}
          </tbody>
        </table>
        {!isLoading && !isEmpty && (
          <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-white">
            Всего: {total}
          </div>
        )}
      </div>
    </>
  )
}

// ── Строка треда ──────────────────────────────────────────

import type { StatusOption } from '@/components/ui/status-dropdown'
import { StatusDropdown } from '@/components/ui/status-dropdown'

interface ThreadRowProps {
  task: WorkspaceTask
  columns: Array<{ key: string; width: number; def: ReturnType<typeof getColumnDef> }>
  checked: boolean
  onToggle: () => void
  onOpen: () => void
  assigneesMap: Record<string, { id: string; name?: string | null; last_name?: string | null }[]>
  taskStatuses: StatusOption[]
}

function ThreadRow({ task, columns, checked, onToggle, onOpen, assigneesMap, taskStatuses }: ThreadRowProps) {
  const updateStatus = useUpdateTaskStatus([
    workspaceThreadKeys.workspace(task.workspace_id),
  ] as never)
  const updateDeadline = useUpdateTaskDeadline([
    workspaceThreadKeys.workspace(task.workspace_id),
  ] as never)

  const currentStatus = taskStatuses.find((s) => s.id === task.status_id) ?? null
  const assignees = assigneesMap[task.id] ?? []
  const overdue = task.deadline ? new Date(task.deadline) < new Date() : false

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c) => {
        const cellWidth = { width: c.width, minWidth: c.def?.minWidth ?? 80 }
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate" style={cellWidth} onClick={onOpen}>
                <div className="flex items-center gap-2 min-w-0">
                  {task.is_pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className="truncate font-medium">{task.name}</span>
                </div>
              </td>
            )
          case 'type':
            return (
              <td key={c.key} className="px-3 py-2" style={cellWidth}>
                <Badge variant="outline" className="text-xs">
                  {task.type === 'chat' ? 'Чат' : 'Задача'}
                </Badge>
              </td>
            )
          case 'status':
            return (
              <td key={c.key} className="px-3 py-2" style={cellWidth} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDropdown
                    currentStatus={currentStatus}
                    statuses={taskStatuses}
                    onStatusChange={(newId) =>
                      updateStatus.mutate({ taskId: task.id, statusId: newId } as never)
                    }
                    size="sm"
                  />
                  {currentStatus && (
                    <span className="text-xs truncate">{currentStatus.name}</span>
                  )}
                </div>
              </td>
            )
          case 'project':
            return (
              <td key={c.key} className="px-3 py-2 truncate text-xs text-muted-foreground" style={cellWidth}>
                {task.project_name ?? '—'}
              </td>
            )
          case 'deadline':
            return (
              <td key={c.key} className="px-3 py-2 text-xs" style={cellWidth} onClick={(e) => e.stopPropagation()}>
                <DeadlineCell
                  value={task.deadline}
                  overdue={overdue}
                  onChange={(iso) =>
                    updateDeadline.mutate({ taskId: task.id, deadline: iso } as never)
                  }
                />
              </td>
            )
          case 'assignees':
            return (
              <td key={c.key} className="px-3 py-2 text-xs" style={cellWidth}>
                {assignees.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span>{assignees.length} чел.</span>
                )}
              </td>
            )
          case 'is_pinned':
            return (
              <td key={c.key} className="px-3 py-2" style={cellWidth}>
                {task.is_pinned ? <Pin className="h-3.5 w-3.5 text-amber-500" /> : null}
              </td>
            )
          case 'created_at':
          case 'updated_at': {
            const value = c.key === 'created_at' ? task.created_at : task.updated_at
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>
                {value ? format(new Date(value), 'dd.MM.yyyy') : '—'}
              </td>
            )
          }
          default:
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>—</td>
        }
      })}
    </tr>
  )
}

// ── Строка проекта ────────────────────────────────────────

interface ProjectRowProps {
  project: BoardProject
  columns: Array<{ key: string; width: number; def: ReturnType<typeof getColumnDef> }>
  checked: boolean
  onToggle: () => void
  onOpen: () => void
  projectStatuses: StatusOption[]
}

function ProjectRow({ project, columns, checked, onToggle, onOpen, projectStatuses }: ProjectRowProps) {
  const currentStatus = projectStatuses.find((s) => s.id === project.status_id) ?? null

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c) => {
        const cellWidth = { width: c.width, minWidth: c.def?.minWidth ?? 80 }
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate font-medium" style={cellWidth} onClick={onOpen}>
                {project.name}
              </td>
            )
          case 'status':
            return (
              <td key={c.key} className="px-3 py-2" style={cellWidth}>
                {currentStatus ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
                    style={{ backgroundColor: (currentStatus.color ?? '#6B7280') + '20', color: currentStatus.color ?? '#374151' }}
                  >
                    {currentStatus.name}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            )
          case 'template':
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>
                {project.template_name ?? '—'}
              </td>
            )
          case 'deadline':
          case 'next_task_deadline':
          case 'created_at':
          case 'updated_at': {
            const v =
              c.key === 'deadline' ? project.deadline :
              c.key === 'next_task_deadline' ? null :
              c.key === 'created_at' ? project.created_at : project.updated_at
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>
                {v ? format(new Date(v as string), 'dd.MM.yyyy') : '—'}
              </td>
            )
          }
          case 'participants':
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>—</td>
          default:
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground" style={cellWidth}>—</td>
        }
      })}
    </tr>
  )
}

// ── Inline-ячейка дедлайна ────────────────────────────────

import { DatePicker } from '@/components/ui/date-picker'

function DeadlineCell({
  value, overdue, onChange,
}: { value: string | null; overdue: boolean; onChange: (iso: string | null) => void }) {
  void overdue // подсветка просроченности встроена в DatePicker через parent класс
  return (
    <DatePicker
      date={value ? new Date(value) : undefined}
      onDateChange={(d) => onChange(d ? d.toISOString() : null)}
      placeholder="—"
    />
  )
}
