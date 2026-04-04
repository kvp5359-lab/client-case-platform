/**
 * Диалог редактирования роли Workspace
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Shield } from 'lucide-react'
import type { Database } from '@/types/database'
import type { WorkspacePermissions } from '@/types/permissions'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import { WORKSPACE_PERMISSION_LABELS } from './constants'
import { safeCssColor } from '@/utils/isValidCssColor'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']

interface WorkspaceRoleEditDialogProps {
  role: WorkspaceRole | null
  onClose: () => void
  onSave: (updates: Partial<WorkspaceRole>) => void
  isSaving: boolean
}

export function WorkspaceRoleEditDialog({
  role,
  onClose,
  onSave,
  isSaving,
}: WorkspaceRoleEditDialogProps) {
  if (!role) return null

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <WorkspaceRoleEditDialogContent
        key={role.id}
        role={role}
        onClose={onClose}
        onSave={onSave}
        isSaving={isSaving}
      />
    </Dialog>
  )
}

function WorkspaceRoleEditDialogContent({
  role,
  onClose,
  onSave,
  isSaving,
}: {
  role: WorkspaceRole
  onClose: () => void
  onSave: (updates: Partial<WorkspaceRole>) => void
  isSaving: boolean
}) {
  // Z5-08: key={role.id} на Content пересоздаёт компонент при смене роли
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description || '')
  const [permissions, setPermissions] = useState<WorkspacePermissions>(
    fromSupabaseJson<WorkspacePermissions>(role.permissions),
  )

  const handlePermissionChange = (key: keyof WorkspacePermissions, value: boolean) => {
    setPermissions({ ...permissions, [key]: value })
  }

  const handleSave = () => {
    onSave({
      name,
      description,
      permissions: toSupabaseJson(permissions),
    })
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" style={{ color: safeCssColor(role.color) }} />
          Настройка роли "{role.name}"
        </DialogTitle>
        <DialogDescription>Настройте разрешения для этой роли workspace</DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Основная информация */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={role.is_system}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <Separator />

        {/* Разрешения */}
        <div className="space-y-4">
          <h4 className="font-medium">Разрешения</h4>

          <div className="grid gap-3">
            {Object.entries(WORKSPACE_PERMISSION_LABELS).map(([key, { label, description }]) => {
              const permKey = key as keyof WorkspacePermissions
              const isDisabled = permKey === 'delete_workspace' && !role.is_owner

              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isDisabled ? 'opacity-50 bg-muted' : 'hover:bg-accent/50'
                  }`}
                >
                  <Checkbox
                    id={key}
                    checked={permissions[permKey]}
                    onCheckedChange={(checked) =>
                      handlePermissionChange(permKey, checked as boolean)
                    }
                    disabled={isDisabled}
                  />
                  <div className="flex-1">
                    <Label htmlFor={key} className="font-medium cursor-pointer">
                      {label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </DialogContent>
  )
}
