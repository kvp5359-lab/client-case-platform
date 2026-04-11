/**
 * Диалог добавления полей
 */

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldDefinition, getFieldTypeLabel } from '../types'

interface AddFieldsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fieldsToAdd: FieldDefinition[]
  selectedFieldIds: string[]
  searchQuery: string
  isAdding: boolean
  onSearchChange: (query: string) => void
  onToggleSelection: (fieldId: string) => void
  onSubmit: () => void
}

export function AddFieldsDialog({
  open,
  onOpenChange,
  fieldsToAdd,
  selectedFieldIds,
  searchQuery,
  isAdding,
  onSearchChange,
  onToggleSelection,
  onSubmit,
}: AddFieldsDialogProps) {
  // Фильтрация по поисковому запросу
  const filteredFields = fieldsToAdd.filter(
    (f) =>
      searchQuery === '' ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onSearchChange('') // Сбрасываем поиск при закрытии
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Добавить поля</DialogTitle>
          <DialogDescription>
            Выберите поля, которые хотите добавить в шаблон анкеты
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Поиск */}
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9"
          />

          {/* Список полей */}
          {filteredFields.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? (
                <p>Ничего не найдено</p>
              ) : (
                <>
                  <p>Все доступные поля уже добавлены в шаблон</p>
                  <p className="text-sm mt-2">Создайте новые поля в разделе «Шаблоны полей»</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-0 max-h-[400px] overflow-y-auto border rounded-md">
              {filteredFields.map((field, index) => (
                <label
                  key={field.id}
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer ${
                    index !== filteredFields.length - 1 ? 'border-b' : ''
                  }`}
                >
                  <Checkbox
                    checked={selectedFieldIds.includes(field.id)}
                    onCheckedChange={() => onToggleSelection(field.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{field.name}</p>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {getFieldTypeLabel(field.field_type)}
                      </Badge>
                    </div>
                    {field.description && (
                      <p className="text-sm text-muted-foreground truncate">{field.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={selectedFieldIds.length === 0 || isAdding}
          >
            {isAdding ? 'Добавление...' : `Добавить (${selectedFieldIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
