/**
 * StatusDropdown Component
 * Универсальный компонент для выбора статуса с иконкой или цветным кружком
 */

import { memo, createElement } from 'react'
import { CircleDashed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getStatusIcon } from '@/components/ui/status-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface StatusOption {
  id: string
  name: string
  color: string
  text_color?: string | null
  icon?: string | null
}

export interface StatusDropdownProps {
  currentStatus?: StatusOption | null
  statuses: StatusOption[]
  onStatusChange: (statusId: string | null) => void
  emptyLabel?: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  align?: 'start' | 'center' | 'end'
}

const sizeClasses = {
  sm: 'w-[19px] h-[19px]',
  md: 'w-4.5 h-4.5',
  lg: 'w-5 h-5',
}

const circleSizeClasses = {
  sm: 'w-[13px] h-[13px]',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
}

function StatusIndicator({
  color,
  icon,
  size,
  className,
}: {
  color: string
  icon?: string | null
  size: 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (icon) {
    return (
      <span className={cn(sizeClasses[size], 'shrink-0 inline-flex', className)}>
        {createElement(getStatusIcon(icon), {
          className: 'w-full h-full',
          style: { color: safeCssColor(color) },
        })}
      </span>
    )
  }
  return (
    <div
      className={cn(circleSizeClasses[size], 'rounded-full shrink-0', className)}
      style={{ backgroundColor: safeCssColor(color) }}
    />
  )
}

export const StatusDropdown = memo(function StatusDropdown({
  currentStatus,
  statuses,
  onStatusChange,
  emptyLabel = 'Не выбран',
  disabled = false,
  size = 'md',
  align = 'start',
}: StatusDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex-shrink-0 flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Статус: ${currentStatus?.name || emptyLabel}`}
        >
          {currentStatus ? (
            <StatusIndicator color={currentStatus.color} icon={currentStatus.icon} size={size} />
          ) : (
            <CircleDashed className={cn(sizeClasses[size], 'text-gray-400')} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onStatusChange(null)
          }}
          className="flex items-center gap-2"
        >
          <CircleDashed className={cn(sizeClasses[size], 'flex-shrink-0 text-gray-400')} />
          <span className="text-gray-500">{emptyLabel}</span>
        </DropdownMenuItem>

        {statuses.map((status) => (
          <DropdownMenuItem
            key={status.id}
            onClick={(e) => {
              e.stopPropagation()
              onStatusChange(status.id)
            }}
            className="flex items-center gap-2"
          >
            <StatusIndicator color={status.color} icon={status.icon} size={size} />
            <span>{status.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
