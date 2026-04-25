"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjectStatusesForTemplate } from '@/hooks/useStatuses'
import type { Project } from '../types'

interface ProjectStatusSelectorProps {
  project: Project
  onStatusChange: (statusId: string) => void
  disabled?: boolean
}

export function ProjectStatusSelector({ project, onStatusChange, disabled }: ProjectStatusSelectorProps) {
  const { data: statuses = [] } = useProjectStatusesForTemplate(project.workspace_id, project.template_id)
  const current = statuses.find((s) => s.id === project.status_id)

  return (
    <Select
      value={project.status_id ?? ''}
      onValueChange={onStatusChange}
      disabled={disabled || statuses.length === 0}
    >
      <SelectTrigger
        className="w-[180px] h-8 text-xs"
        style={
          current
            ? {
                backgroundColor: `${current.color}1A`,
                color: current.color,
                borderColor: `${current.color}66`,
              }
            : undefined
        }
      >
        <SelectValue placeholder="Без статуса" />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id} className="text-xs">
            <div
              className="px-2 py-0.5 rounded border"
              style={{
                backgroundColor: `${status.color}1A`,
                color: status.color,
                borderColor: `${status.color}66`,
              }}
            >
              {status.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
