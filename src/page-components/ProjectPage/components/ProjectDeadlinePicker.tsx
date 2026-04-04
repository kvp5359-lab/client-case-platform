/**
 * Компонент для выбора дедлайна проекта
 */

import { DatePicker } from '@/components/ui/date-picker'
import type { Project } from '../types'

interface ProjectDeadlinePickerProps {
  project: Project
  onDeadlineChange: (date: Date | undefined) => void
  disabled?: boolean
}

export function ProjectDeadlinePicker({
  project,
  onDeadlineChange,
  disabled,
}: ProjectDeadlinePickerProps) {
  const deadline = project.deadline ? new Date(project.deadline) : undefined

  return <DatePicker date={deadline} onDateChange={onDeadlineChange} disabled={disabled} />
}
