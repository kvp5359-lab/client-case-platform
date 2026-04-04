/**
 * Фильтр статусов по типу сущности
 */

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ENTITY_TYPE_LABELS, type EntityType } from './hooks/useStatusesDirectory'

interface StatusesEntityFilterProps {
  selectedEntityType: EntityType
  onEntityTypeChange: (type: EntityType) => void
}

export function StatusesEntityFilter({
  selectedEntityType,
  onEntityTypeChange,
}: StatusesEntityFilterProps) {
  return (
    <div className="flex items-center gap-4">
      <Label className="text-sm font-medium">Тип сущности:</Label>
      <div className="flex gap-2">
        {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((type) => (
          <Button
            key={type}
            variant={selectedEntityType === type ? 'default' : 'outline'}
            size="sm"
            onClick={() => onEntityTypeChange(type)}
          >
            {ENTITY_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  )
}
