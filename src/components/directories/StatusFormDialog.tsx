/**
 * Диалог создания/редактирования статуса
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ColorPicker } from '@/components/ui/color-picker'
import { STATUS_ICONS } from '@/components/ui/status-icons'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Database } from '@/types/database'

type Status = Database['public']['Tables']['statuses']['Row']
type StatusInsert = Database['public']['Tables']['statuses']['Insert']

interface StatusFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingStatus: Status | null
  formData: StatusInsert
  onFormDataChange: (data: StatusInsert) => void
  onSave: () => void
  saving: boolean
  entityTypeLabel: string
}

export function StatusFormDialog({
  open,
  onOpenChange,
  editingStatus,
  formData,
  onFormDataChange,
  onSave,
  saving,
  entityTypeLabel,
}: StatusFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingStatus ? 'Редактировать статус' : 'Новый статус'}</DialogTitle>
          <DialogDescription>
            {editingStatus
              ? 'Измените параметры статуса'
              : `Создайте новый статус для ${entityTypeLabel.toLowerCase()}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder="Например: В работе"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              placeholder="Краткое описание статуса"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="button_label">Название кнопки</Label>
            <Input
              id="button_label"
              value={formData.button_label || ''}
              onChange={(e) => onFormDataChange({ ...formData, button_label: e.target.value })}
              placeholder="Например: Завершить, Готово"
              disabled={saving}
            />
            <p className="text-xs text-gray-500">
              Текст, который будет отображаться на кнопке перехода в этот статус
            </p>
          </div>

          <div className="flex gap-6">
            <ColorPicker
              value={formData.color}
              onChange={(color) => onFormDataChange({ ...formData, color })}
              disabled={saving}
              label="Цвет статуса"
            />
            <ColorPicker
              value={formData.text_color || '#1F2937'}
              onChange={(textColor) => onFormDataChange({ ...formData, text_color: textColor })}
              disabled={saving}
              label="Цвет названия"
            />
          </div>

          {/* Выбор иконки (только для задач) */}
          {formData.entity_type === 'task' && (
            <div className="space-y-2">
              <Label>Иконка статуса</Label>
              <div className="grid grid-cols-10 gap-1">
                {STATUS_ICONS.map((si) => {
                  const Icon = si.icon
                  const isSelected = formData.icon === si.id
                  return (
                    <button
                      key={si.id}
                      type="button"
                      title={si.label}
                      onClick={() => onFormDataChange({ ...formData, icon: si.id })}
                      disabled={saving}
                      className={cn(
                        'w-8 h-8 rounded-md flex items-center justify-center transition-colors',
                        isSelected ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted/50',
                      )}
                    >
                      <Icon className="w-4 h-4" style={{ color: safeCssColor(formData.color) }} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) =>
                  onFormDataChange({ ...formData, is_default: !!checked })
                }
                disabled={saving}
              />
              <label htmlFor="is_default" className="text-sm cursor-pointer">
                Статус по умолчанию
                <span className="text-gray-500 ml-1">(для новых элементов)</span>
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_final"
                checked={formData.is_final}
                onCheckedChange={(checked) =>
                  onFormDataChange({ ...formData, is_final: !!checked })
                }
                disabled={saving}
              />
              <label htmlFor="is_final" className="text-sm cursor-pointer">
                Финальный статус
                <span className="text-gray-500 ml-1">(завершён, отклонён)</span>
              </label>
            </div>

            {formData.entity_type === 'task' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_to_creator"
                  checked={formData.show_to_creator ?? false}
                  onCheckedChange={(checked) =>
                    onFormDataChange({ ...formData, show_to_creator: !!checked })
                  }
                  disabled={saving}
                />
                <label htmlFor="show_to_creator" className="text-sm cursor-pointer">
                  Показывать постановщику
                  <span className="text-gray-500 ml-1">(скрыть у исполнителя)</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение...' : editingStatus ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
