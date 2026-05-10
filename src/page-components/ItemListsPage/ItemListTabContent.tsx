"use client"

/**
 * Содержимое активной вкладки ItemListsPage — собственно таблица для одного
 * item_list. Не оборачивает WorkspaceLayout и не имеет своей шапки —
 * родитель (ItemListsPage) рендерит вкладки и диалоги настроек/удаления.
 *
 * Получает уже загруженный `list` пропсом, чтобы дочерние useFilteredTasks/
 * Projects не дублировали query на детали списка.
 *
 * При смене активной вкладки родитель монтирует TabContent с key={list.id},
 * поэтому локальный selectedIds естественно сбрасывается без useEffect.
 *
 * MVP-ограничения:
 *  - Inline-смена «Проекта» треда — только через bulk action.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pin } from 'lucide-react'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceThreads, type WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { useTaskStatuses, useAllProjectStatuses } from '@/hooks/useStatuses'
import { useFilteredTasks, useFilteredProjects } from '@/components/boards/hooks/useFilteredListData'
import { useUpdateTaskStatus, useUpdateTaskDeadline } from '@/components/tasks/useTaskMutations'
import { workspaceThreadKeys } from '@/hooks/queryKeys'
import type { FilterContext, FilterGroup } from '@/lib/filters/types'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import { useUpdateItemList, type ItemList, type ItemListColumnConfig } from '@/hooks/useItemLists'
import { defaultColumnsForEntity, getColumnDef, type ItemListColumnKey } from './columns'
import { BulkActionsBar } from './BulkActionsBar'
import type { StatusOption } from '@/components/ui/status-dropdown'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { DatePicker } from '@/components/ui/date-picker'

interface ItemListTabContentProps {
  list: ItemList
  workspaceId: string
  currentUserId: string
}

export function ItemListTabContent({ list, workspaceId, currentUserId }: ItemListTabContentProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const updateList = useUpdateItemList()

  // Локальное состояние ширин — чтобы ресайз был мгновенным, без ожидания сети.
  // Синхронизируется с list при смене списка или внешнем апдейте конфига.
  const [columnConfig, setColumnConfig] = useState<ItemListColumnConfig[]>(
    () => (list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type)),
  )
  /* eslint-disable react-hooks/set-state-in-effect -- props→state sync */
  useEffect(() => {
    setColumnConfig(list.columns?.length ? list.columns : defaultColumnsForEntity(list.entity_type))
  }, [list.id, list.columns, list.entity_type])
  /* eslint-enable react-hooks/set-state-in-effect */

  // На mouseup коммитим финальную ширину в state + БД одним апдейтом.
  // Промежуточные кадры drag не идут через React — see ColumnResizeHandle.
  const handleResizeCommit = (key: string, width: number) => {
    const next = columnConfig.map((c) => (c.key === key ? { ...c, width } : c))
    setColumnConfig(next)
    updateList.mutate({ id: list.id, workspace_id: workspaceId, columns: next })
  }

  const columns = columnConfig
    .filter((c) => c.visible)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ ...c, def: getColumnDef(c.key) }))
    .filter((c) => c.def) as Array<{ key: string; width: number; def: NonNullable<ReturnType<typeof getColumnDef>> }>

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {list.entity_type === 'thread' ? (
        <ThreadTableView
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          filters={list.filter_config}
          sortBy={list.sort_by}
          sortDir={list.sort_dir}
          columns={columns}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onResizeCommit={handleResizeCommit}
        />
      ) : (
        <ProjectTableView
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          filters={list.filter_config}
          sortBy={list.sort_by}
          sortDir={list.sort_dir}
          columns={columns}
          selectedIds={selectedIds}
          onSelectedChange={setSelectedIds}
          onResizeCommit={handleResizeCommit}
        />
      )}
    </div>
  )
}

// ── Таблица для тредов ─────────────────────────────────────

interface TableViewProps {
  workspaceId: string
  currentUserId: string
  filters: FilterGroup
  sortBy: string | null
  sortDir: 'asc' | 'desc' | null
  columns: Array<{ key: string; width: number; def: NonNullable<ReturnType<typeof getColumnDef>> }>
  selectedIds: Set<string>
  onSelectedChange: (next: Set<string>) => void
  onResizeCommit: (key: string, width: number) => void
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
  onResizeCommit,
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
      onResizeCommit={onResizeCommit}
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
  onResizeCommit,
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

  // participantsMap для junction-фильтра — пустая map в MVP (см. infrastructure.md).
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
      onResizeCommit={onResizeCommit}
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
  columns: Array<{ key: string; width: number; def: NonNullable<ReturnType<typeof getColumnDef>> }>
  selectedIds: Set<string>
  allItemIds: string[]
  onSelectedChange: (next: Set<string>) => void
  onResizeCommit: (key: string, width: number) => void
  bulkActions: React.ReactNode
  renderRow: (item: T) => React.ReactNode
  items: T[]
}

const CHECKBOX_COL_WIDTH = 36

function TableShell<T extends { id: string }>({
  isLoading, isEmpty, total, columns, selectedIds, allItemIds,
  onSelectedChange, onResizeCommit, bulkActions, renderRow, items,
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
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onSelectedChange(new Set())}
          >
            Снять выделение
          </button>
          <div className="ml-auto flex items-center gap-2">{bulkActions}</div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        <table
          className="text-sm border-collapse table-fixed"
          style={{ width: CHECKBOX_COL_WIDTH + columns.reduce((s, c) => s + c.width, 0) }}
        >
          <colgroup>
            <col style={{ width: CHECKBOX_COL_WIDTH }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-white border-b z-10">
            <tr>
              <th className="px-3 py-2 text-left">
                <Checkbox
                  checked={allChecked || (someChecked ? 'indeterminate' : false)}
                  onCheckedChange={toggleAll}
                />
              </th>
              {columns.map((c, idx) => (
                <th
                  key={c.key}
                  className="relative text-left text-xs font-medium text-muted-foreground px-3 py-2 truncate select-none"
                >
                  {c.def.label}
                  <ColumnResizeHandle
                    columnKey={c.key}
                    colIndex={idx + 1}
                    minWidth={c.def.minWidth}
                    onCommit={onResizeCommit}
                  />
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

interface ThreadRowProps {
  task: WorkspaceTask
  columns: Array<{ key: string; width: number; def: NonNullable<ReturnType<typeof getColumnDef>> }>
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

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={checked} onCheckedChange={onToggle} />
      </td>
      {columns.map((c) => {
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate" onClick={onOpen}>
                <div className="flex items-center gap-2 min-w-0">
                  {task.is_pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className="truncate font-medium">{task.name}</span>
                </div>
              </td>
            )
          case 'type':
            return (
              <td key={c.key} className="px-3 py-2">
                <Badge variant="outline" className="text-xs">
                  {task.type === 'chat' ? 'Чат' : 'Задача'}
                </Badge>
              </td>
            )
          case 'status':
            return (
              <td key={c.key} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
              <td key={c.key} className="px-3 py-2 truncate text-xs text-muted-foreground">
                {task.project_name ?? '—'}
              </td>
            )
          case 'deadline':
            return (
              <td key={c.key} className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                <DatePicker
                  date={task.deadline ? new Date(task.deadline) : undefined}
                  onDateChange={(d) =>
                    updateDeadline.mutate({ taskId: task.id, deadline: d ? d.toISOString() : null } as never)
                  }
                  placeholder="—"
                />
              </td>
            )
          case 'assignees':
            return (
              <td key={c.key} className="px-3 py-2 text-xs">
                {assignees.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span>{assignees.length} чел.</span>
                )}
              </td>
            )
          case 'is_pinned':
            return (
              <td key={c.key} className="px-3 py-2">
                {task.is_pinned ? <Pin className="h-3.5 w-3.5 text-amber-500" /> : null}
              </td>
            )
          case 'created_at':
          case 'updated_at': {
            const value = c.key === 'created_at' ? task.created_at : task.updated_at
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">
                {value ? format(new Date(value), 'dd.MM.yyyy') : '—'}
              </td>
            )
          }
          default:
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">—</td>
        }
      })}
    </tr>
  )
}

// ── Строка проекта ────────────────────────────────────────

interface ProjectRowProps {
  project: BoardProject
  columns: Array<{ key: string; width: number; def: NonNullable<ReturnType<typeof getColumnDef>> }>
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
        switch (c.key as ItemListColumnKey) {
          case 'name':
            return (
              <td key={c.key} className="px-3 py-2 cursor-pointer truncate font-medium" onClick={onOpen}>
                {project.name}
              </td>
            )
          case 'status':
            return (
              <td key={c.key} className="px-3 py-2">
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
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">
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
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">
                {v ? format(new Date(v as string), 'dd.MM.yyyy') : '—'}
              </td>
            )
          }
          case 'participants':
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">—</td>
          default:
            return <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">—</td>
        }
      })}
    </tr>
  )
}

// ── Drag-handle для ресайза колонки ────────────────────────

interface ColumnResizeHandleProps {
  columnKey: string
  /** Индекс <col> внутри <colgroup> (с учётом чекбокс-колонки = 0). */
  colIndex: number
  minWidth: number
  onCommit: (key: string, width: number) => void
}

/**
 * Drag-ресайз колонки. Чтобы не лагать на каждом mousemove, во время drag
 * двигаем DOM напрямую (style.width у <col> и у <table>) — React не
 * перерисовывает строки. На mouseup однократно коммитим финальную ширину
 * в state + БД через onCommit.
 */
function ColumnResizeHandle({ columnKey, colIndex, minWidth, onCommit }: ColumnResizeHandleProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const handleEl = ref.current
    if (!handleEl) return
    const tableEl = handleEl.closest('table') as HTMLTableElement | null
    if (!tableEl) return
    const colEl = tableEl.querySelectorAll('colgroup col')[colIndex] as HTMLTableColElement | undefined
    if (!colEl) return

    const startX = e.clientX
    const startWidth = parseFloat(colEl.style.width) || colEl.getBoundingClientRect().width
    const startTableWidth = parseFloat(tableEl.style.width) || tableEl.getBoundingClientRect().width
    let lastWidth = startWidth

    setActive(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const next = Math.max(minWidth, Math.round(startWidth + dx))
      lastWidth = next
      colEl.style.width = `${next}px`
      tableEl.style.width = `${startTableWidth + (next - startWidth)}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setActive(false)
      onCommit(columnKey, lastWidth)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-20 hover:bg-primary/40 ${active ? 'bg-primary/60' : ''}`}
    />
  )
}
