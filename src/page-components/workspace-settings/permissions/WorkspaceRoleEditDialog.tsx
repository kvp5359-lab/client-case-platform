/**
 * Диалог редактирования роли Workspace
 */

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Shield } from 'lucide-react'
import type { Database } from '@/types/database'
import type { WorkspacePermissions } from '@/types/permissions'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import { WORKSPACE_PERMISSION_LABELS } from './constants'
import { RoleEditDialogBase } from './RoleEditDialogBase'

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
    <WorkspaceRoleEditDialogContent
      key={role.id}
      role={role}
      onClose={onClose}
      onSave={onSave}
      isSaving={isSaving}
    />
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
    <RoleEditDialogBase
      open
      onClose={onClose}
      onSave={handleSave}
      isSaving={isSaving}
      roleName={role.name}
      roleColor={role.color}
      icon={Shield}
      description="Настройте разрешения для этой роли workspace"
      name={name}
      onNameChange={setName}
      roleDescription={description}
      onDescriptionChange={setDescription}
      isSystem={role.is_system}
    >
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
    </RoleEditDialogBase>
  )
}
