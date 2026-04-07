/**
 * Status icon popover for ChatSettingsDialog name field.
 * Uses the shared StatusDropdown component for consistent styling.
 */

import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'

interface TaskStatus {
  id: string
  name: string
  color: string
  icon: string | null
  is_default: boolean
}

interface ChatSettingsStatusPopoverProps {
  taskStatuses: TaskStatus[]
  currentStatusId: string | null
  currentStatus: TaskStatus | undefined
  statusPopoverOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (statusId: string) => void
}

export function ChatSettingsStatusPopover({
  taskStatuses,
  currentStatus,
  onSelect,
}: ChatSettingsStatusPopoverProps) {
  if (taskStatuses.length === 0) return null

  const statuses: StatusOption[] = taskStatuses.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
  }))

  const current: StatusOption | null = currentStatus
    ? { id: currentStatus.id, name: currentStatus.name, color: currentStatus.color, icon: currentStatus.icon }
    : null

  return (
    <div className="flex items-center justify-center shrink-0 pl-2.5">
      <StatusDropdown
        currentStatus={current}
        statuses={statuses}
        onStatusChange={(id) => { if (id) onSelect(id) }}
        size="md"
      />
    </div>
  )
}
