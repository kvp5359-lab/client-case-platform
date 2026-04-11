/**
 * Диалог редактирования роли Проекта
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
import { Users, Settings, FileText, FolderOpen } from 'lucide-react'
import type { Database } from '@/types/database'
import type { ProjectModuleAccess, ProjectPermissions } from '@/types/permissions'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import { MODULE_LABELS } from './constants'
import { safeCssColor } from '@/utils/isValidCssColor'
import { ModulePermissionsSection } from './ModulePermissionsSection'

type ProjectRole = Database['public']['Tables']['project_roles']['Row']

interface ProjectRoleEditDialogProps {
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
    <Dialog open onOpenChange={() => onClose()}>
      <ProjectRoleEditDialogContent
        key={role.id}
        role={role}
        onClose={onClose}
        onSave={onSave}
        isSaving={isSaving}
      />
    </Dialog>
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
  // key={role.id} на Content пересоздаёт компонент при смене роли
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description || '')
  const [moduleAccess, setModuleAccess] = useState<ProjectModuleAccess>(
    fromSupabaseJson<ProjectModuleAccess>(role.module_access),
  )
  const [permissions, setPermissions] = useState<ProjectPermissions>(
    fromSupabaseJson<ProjectPermissions>(role.permissions),
  )
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({})

  const handleModuleAccessChange = (key: keyof ProjectModuleAccess, value: boolean) => {
    setModuleAccess({ ...moduleAccess, [key]: value })
  }

  const handlePermissionChange = (
    module: keyof ProjectPermissions,
    permission: string,
    value: boolean,
  ) => {
    setPermissions({
      ...permissions,
      [module]: {
        ...permissions[module],
        [permission]: value,
      },
    })
  }

  const toggleModule = (module: string) => {
    setExpandedModules((prev) => ({ ...prev, [module]: !prev[module] }))
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
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: safeCssColor(role.color) }} />
          Настройка роли «{role.name}»
        </DialogTitle>
        <DialogDescription>
          Настройте доступ к модулям и разрешения внутри проектов
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Основная информация */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Название</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={role.is_system}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-description">Описание</Label>
            <Input
              id="proj-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <Separator />

        {/* Доступ к модулям */}
        <div className="space-y-4">
          <h4 className="font-medium">Доступ к модулям</h4>

          <div className="grid gap-2">
            {Object.entries(MODULE_LABELS).map(([key, { label, icon: Icon }]) => {
              const modKey = key as keyof ProjectModuleAccess

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50"
                >
                  <Checkbox
                    id={`mod-${key}`}
                    checked={moduleAccess[modKey]}
                    onCheckedChange={(checked) =>
                      handleModuleAccessChange(modKey, checked as boolean)
                    }
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor={`mod-${key}`} className="flex-1 cursor-pointer">
                    {label}
                  </Label>
                </div>
              )
            })}
          </div>
        </div>

        <Separator />

        {/* Разрешения внутри модулей */}
        <div className="space-y-4">
          <h4 className="font-medium">Разрешения внутри модулей</h4>

          {/* Settings */}
          {permissions.settings && (
            <ModulePermissionsSection
              title="Настройки"
              icon={Settings}
              expanded={expandedModules.settings}
              onToggle={() => toggleModule('settings')}
              permissions={[
                {
                  key: 'edit_project_info',
                  label: 'Редактировать информацию',
                  value: permissions.settings.edit_project_info,
                },
                {
                  key: 'manage_project_participants',
                  label: 'Управлять участниками',
                  value: permissions.settings.manage_project_participants,
                },
                {
                  key: 'manage_google_drive',
                  label: 'Настройка Google Drive',
                  value: permissions.settings.manage_google_drive,
                },
                {
                  key: 'delete_project',
                  label: 'Удалить проект',
                  value: permissions.settings.delete_project,
                },
              ]}
              onChange={(key, value) => handlePermissionChange('settings', key, value)}
            />
          )}

          {/* Forms */}
          {permissions.forms && (
            <ModulePermissionsSection
              title="Анкеты"
              icon={FileText}
              expanded={expandedModules.forms}
              onToggle={() => toggleModule('forms')}
              permissions={[
                { key: 'add_forms', label: 'Добавлять анкеты', value: permissions.forms.add_forms },
                {
                  key: 'fill_forms',
                  label: 'Заполнять анкеты',
                  value: permissions.forms.fill_forms,
                },
                {
                  key: 'edit_own_form_answers',
                  label: 'Редактировать свои ответы',
                  value: permissions.forms.edit_own_form_answers,
                },
                {
                  key: 'view_others_form_answers',
                  label: 'Видеть ответы других',
                  value: permissions.forms.view_others_form_answers,
                },
              ]}
              onChange={(key, value) => handlePermissionChange('forms', key, value)}
            />
          )}

          {/* Documents */}
          {permissions.documents && (
            <ModulePermissionsSection
              title="Документы"
              icon={FolderOpen}
              expanded={expandedModules.documents}
              onToggle={() => toggleModule('documents')}
              permissions={[
                {
                  key: 'add_documents',
                  label: 'Добавлять документы',
                  value: permissions.documents.add_documents,
                },
                {
                  key: 'view_documents',
                  label: 'Просматривать документы',
                  value: permissions.documents.view_documents,
                },
                {
                  key: 'edit_documents',
                  label: 'Редактировать документы',
                  value: permissions.documents.edit_documents,
                },
                {
                  key: 'download_documents',
                  label: 'Скачивать документы',
                  value: permissions.documents.download_documents,
                },
                {
                  key: 'move_documents',
                  label: 'Перемещать документы',
                  value: permissions.documents.move_documents,
                },
                {
                  key: 'delete_documents',
                  label: 'Удалять документы',
                  value: permissions.documents.delete_documents,
                },
                {
                  key: 'compress_pdf',
                  label: 'Сжимать PDF',
                  value: permissions.documents.compress_pdf,
                },
                {
                  key: 'view_document_technical_info',
                  label: 'Техническая информация',
                  value: permissions.documents.view_document_technical_info,
                },
                {
                  key: 'create_folders',
                  label: 'Создавать секции',
                  value: permissions.documents.create_folders,
                },
                {
                  key: 'add_document_kits',
                  label: 'Добавлять наборы',
                  value: permissions.documents.add_document_kits,
                },
              ]}
              onChange={(key, value) => handlePermissionChange('documents', key, value)}
            />
          )}
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
