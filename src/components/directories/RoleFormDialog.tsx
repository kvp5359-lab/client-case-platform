/**
 * Диалог создания/редактирования роли
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Database } from '@/types/database'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']
type ProjectRole = Database['public']['Tables']['project_roles']['Row']

export type RoleInsert = {
  workspace_id: string
  name: string
  description?: string | null
  color?: string
  order_index?: number
}

export const ROLE_PRESET_COLORS = [
  '#DC2626',
  '#2563EB',
  '#16A34A',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
  '#14B8A6',
]

interface RoleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingRole: WorkspaceRole | ProjectRole | null
  formData: RoleInsert
  onFormDataChange: (data: RoleInsert) => void
  onSave: () => void
  saving: boolean
  type: 'workspace' | 'project'
}

export function RoleFormDialog({
  open,
  onOpenChange,
  editingRole,
  formData,
  onFormDataChange,
  onSave,
  saving,
  type,
}: RoleFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRole ? 'Редактировать роль' : 'Новая роль'}</DialogTitle>
          <DialogDescription>
            {editingRole
              ? 'Измените параметры роли'
              : `Создайте новую ${type === 'workspace' ? 'роль workspace' : 'роль проекта'}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder="Например: Менеджер"
              disabled={saving || editingRole?.is_system}
            />
            {editingRole?.is_system && (
              <p className="text-xs text-gray-500">Название системной роли нельзя изменить</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              placeholder="Краткое описание роли"
              disabled={saving}
            />
          </div>

          <ColorPicker
            value={formData.color || '#6B7280'}
            onChange={(color) => onFormDataChange({ ...formData, color })}
            disabled={saving}
            presetColors={ROLE_PRESET_COLORS}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение...' : editingRole ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
