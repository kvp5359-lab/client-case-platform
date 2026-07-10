/**
 * Диалог редактирования роли Workspace.
 * Права рисуются группами из единого реестра.
 */

import { useState } from 'react'
import { Shield } from 'lucide-react'
import type { Database } from '@/types/database'
import type { WorkspacePermission, WorkspacePermissions } from '@/types/permissions'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import {
  WORKSPACE_PERM_GROUPS,
  WORKSPACE_PERMISSION_DEFS,
  emptyWorkspacePermissions,
} from '@/lib/permissions/registry'
import { RoleEditDialogBase } from './RoleEditDialogBase'
import { PermissionGroup, PermissionToggleRow } from './PermissionControls'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']

type WorkspaceRoleEditDialogProps = {
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
  const [permissions, setPermissions] = useState<WorkspacePermissions>({
    ...emptyWorkspacePermissions(),
    ...fromSupabaseJson<Partial<WorkspacePermissions>>(role.permissions),
  })

  const setPerm = (key: WorkspacePermission, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    onSave({ name, description, permissions: toSupabaseJson(permissions) })
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
        {WORKSPACE_PERM_GROUPS.map((group) => {
          const defs = WORKSPACE_PERMISSION_DEFS.filter((d) => d.group === group.id)
          if (defs.length === 0) return null
          return (
            <PermissionGroup key={group.id} title={group.label}>
              {defs.map((def) => {
                const disabled = !!def.ownerOnly && !role.is_owner
                return (
                  <PermissionToggleRow
                    key={def.key}
                    checked={permissions[def.key]}
                    onChange={(v) => setPerm(def.key, v)}
                    label={def.label}
                    description={def.description}
                    danger={def.danger}
                    disabled={disabled}
                  />
                )
              })}
            </PermissionGroup>
          )
        })}
      </div>
    </RoleEditDialogBase>
  )
}
