/**
 * Диалог редактирования роли Проекта.
 * Модули — сеткой тумблеров, действия — компактными группами. Всё из реестра.
 */

import { useState } from 'react'
import { Users } from 'lucide-react'
import type { Database } from '@/types/database'
import type { ProjectModuleAccess, ProjectPermissions } from '@/types/permissions'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import {
  PROJECT_MODULE_DEFS,
  PROJECT_ACTION_GROUPS,
  type ProjectActionModule,
} from '@/lib/permissions/registry'
import { RoleEditDialogBase } from './RoleEditDialogBase'
import { PermissionGroup, PermissionToggleRow, ModuleToggle } from './PermissionControls'

type ProjectRole = Database['public']['Tables']['project_roles']['Row']

type ProjectRoleEditDialogProps = {
  role: ProjectRole | null
  onClose: () => void
  onSave: (updates: Partial<ProjectRole>) => void
  isSaving: boolean
}

export function ProjectRoleEditDialog({
  role,
  onClose,
  onSave,
  isSaving,
}: ProjectRoleEditDialogProps) {
  if (!role) return null

  return (
    <ProjectRoleEditDialogContent
      key={role.id}
      role={role}
      onClose={onClose}
      onSave={onSave}
      isSaving={isSaving}
    />
  )
}

function ProjectRoleEditDialogContent({
  role,
  onClose,
  onSave,
  isSaving,
}: {
  role: ProjectRole
  onClose: () => void
  onSave: (updates: Partial<ProjectRole>) => void
  isSaving: boolean
}) {
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description || '')
  const [moduleAccess, setModuleAccess] = useState<ProjectModuleAccess>(
    fromSupabaseJson<ProjectModuleAccess>(role.module_access),
  )
  const [permissions, setPermissions] = useState<ProjectPermissions>(
    fromSupabaseJson<ProjectPermissions>(role.permissions),
  )

  const setModule = (key: keyof ProjectModuleAccess, value: boolean) => {
    setModuleAccess((prev) => ({ ...prev, [key]: value }))
  }

  const setAction = (module: ProjectActionModule, key: string, value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: { ...prev[module], [key]: value },
    }))
  }

  const handleSave = () => {
    onSave({
      name,
      description,
      module_access: toSupabaseJson(moduleAccess),
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
      icon={Users}
      description="Настройте доступ к модулям и разрешения внутри проектов"
      name={name}
      onNameChange={setName}
      roleDescription={description}
      onDescriptionChange={setDescription}
      isSystem={role.is_system}
    >
      <div className="space-y-5">
        {/* Видимость модулей */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Доступ к модулям — что видно</span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PROJECT_MODULE_DEFS.map((def) => (
              <ModuleToggle
                key={def.key}
                checked={moduleAccess[def.key] === true}
                onChange={(v) => setModule(def.key, v)}
                label={def.label}
                icon={def.icon}
              />
            ))}
          </div>
        </div>

        {/* Действия внутри модулей */}
        {PROJECT_ACTION_GROUPS.map((grp) => {
          const modulePerms = permissions[grp.module] as Record<string, boolean> | undefined
          if (!modulePerms) return null
          const Icon = grp.icon
          return (
            <PermissionGroup
              key={grp.module}
              title={
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {grp.label} — действия
                </span>
              }
            >
              {grp.actions.map((a) => (
                <PermissionToggleRow
                  key={a.key}
                  checked={modulePerms[a.key] === true}
                  onChange={(v) => setAction(grp.module, a.key, v)}
                  label={a.label}
                  danger={a.danger}
                />
              ))}
            </PermissionGroup>
          )
        })}
      </div>
    </RoleEditDialogBase>
  )
}
