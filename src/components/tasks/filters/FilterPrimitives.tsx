"use client"

/**
 * Примитивы фильтров: FilterToolbar, CheckItem, FilterButton.
 * Используются в фильтрах AssigneeFilter, DeadlineFilter, StatusFilter, ProjectFilter.
 */

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Панель управления фильтра (сверху в попапе) */
export function FilterToolbar({
  totalCount,
  selectedCount,
  onSelectAll,
  onClear,
}: {
  totalCount: number
  selectedCount: number
  onSelectAll: () => void
  onClear: () => void
}) {
  const allSelected = selectedCount === totalCount && totalCount > 0
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b">
      <button
        type="button"
        onClick={allSelected ? onClear : onSelectAll}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {allSelected ? 'Снять все' : 'Выбрать все'}
      </button>
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Сбросить
        </button>
      )}
    </div>
  )
}

/** Чекбокс-элемент */
export function CheckItem({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
    >
      {children}
      <div
        className={cn(
          'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ml-auto',
          checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </button>
  )
}

/** Текст кнопки фильтра — показывает выбранные значения или placeholder */
export function FilterButton({
  icon: Icon,
  label,
  selectedLabels,
  active,
  onClick,
}: {
  icon: typeof ChevronDown
  label: string
  selectedLabels: string[]
  active: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors max-w-[250px]',
        active
          ? 'border-brand-200 bg-brand-100 text-brand-600 font-medium'
          : 'border-input text-muted-foreground hover:bg-muted/50',
      )}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {selectedLabels.length > 0 ? (
        <span className="truncate">{selectedLabels.join(', ')}</span>
      ) : (
        <span>{label}</span>
      )}
      <ChevronDown className="w-2.5 h-2.5 opacity-50 shrink-0" />
    </button>
  )
}
