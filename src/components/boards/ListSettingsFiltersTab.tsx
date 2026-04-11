"use client"

/**
 * Вкладка "Фильтры" в диалоге настроек списка доски. Тонкая обёртка над
 * <FilterGroupEditor> с описанием и кнопкой "Очистить все фильтры".
 *
 * Вынесено из ListSettingsDialog.tsx, чтобы главный компонент не превышал
 * 400 строк (аудит 2026-04-11, Зона 6).
 */

import { Button } from '@/components/ui/button'
import { FilterGroupEditor } from './filters/FilterGroupEditor'
import type { FilterGroup } from './types'

interface ListSettingsFiltersTabProps {
  filters: FilterGroup
  onFiltersChange: (filters: FilterGroup) => void
  entityType: 'task' | 'project'
  workspaceId: string
}

export function ListSettingsFiltersTab({
  filters,
  onFiltersChange,
  entityType,
  workspaceId,
}: ListSettingsFiltersTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Настройте условия фильтрации. Условия внутри группы объединяются логикой И или ИЛИ.
        Вы можете создавать вложенные группы и перетаскивать условия между группами.
      </p>
      <FilterGroupEditor
        group={filters}
        onChange={onFiltersChange}
        entityType={entityType}
        depth={0}
        workspaceId={workspaceId}
      />

      {filters.rules.length > 0 && (
        <div className="pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onFiltersChange({ logic: 'and', rules: [] })}
          >
            Очистить все фильтры
          </Button>
        </div>
      )}
    </div>
  )
}
