"use client"

import { formatSmartDateCompact } from '@/utils/format/dateFormat'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { BoardProject } from '@/components/boards/hooks/useWorkspaceProjects'
import type { TableShellColumn, RowRenderMeta } from './TableShell'
import type { ItemListColumnKey } from './columns'

type ProjectRowProps = {
  project: BoardProject
  columns: TableShellColumn[]
  checked: boolean
  onToggle: (shift: boolean) => void
  onOpen: () => void
  projectStatuses: StatusOption[]
  /** Виртуализация: ref для measureElement + индекс строки (см. TableShell). */
  measureRef?: RowRenderMeta['measureRef']
  dataIndex?: number
  /** Строка под клавиатурным фокусом — подсветка. */
  focused?: boolean
}

export function ProjectRow({ project, columns, checked, onToggle, onOpen, projectStatuses, measureRef, dataIndex, focused }: ProjectRowProps) {
  const currentStatus = projectStatuses.find((s) => s.id === project.status_id) ?? null

  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={cn('border-b hover:bg-muted/30', focused && 'bg-muted/60')}
    >
      <td
        className="px-3 py-2 select-none"
        onClick={(e) => {
          e.stopPropagation()
          onToggle(e.shiftKey)
        }}
      >
        <Checkbox checked={checked} className="pointer-events-none" />
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
              c.key === 'next_task_deadline' ? project.next_task_deadline ?? null :
              c.key === 'created_at' ? project.created_at : project.updated_at
            return (
              <td key={c.key} className="px-3 py-2 text-xs text-muted-foreground">
                {formatSmartDateCompact(v as string | null)}
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
