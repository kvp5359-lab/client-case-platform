/**
 * Компонент для выбора статуса проекта
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PROJECT_STATUSES } from '../constants'
import type { Project } from '../types'

interface ProjectStatusSelectorProps {
  project: Project
  onStatusChange: (status: string) => void
  disabled?: boolean
}

export function ProjectStatusSelector({ project, onStatusChange, disabled }: ProjectStatusSelectorProps) {
  const currentStatus = PROJECT_STATUSES.find((s) => s.value === project.status)

  return (
    <Select value={project.status || 'active'} onValueChange={onStatusChange} disabled={disabled}>
      <SelectTrigger
        className={`w-[140px] h-8 text-xs ${currentStatus?.color || ''}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((status) => (
          <SelectItem key={status.value} value={status.value} className="text-xs">
            <div className={`px-2 py-0.5 rounded border ${status.color}`}>
              {status.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
