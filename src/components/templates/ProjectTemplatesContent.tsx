/**
 * ProjectTemplatesContent — список типов проектов (шаблонов)
 *
 * Отображает:
 * - Поиск по названию
 * - Таблица с типами проектов (название, описание)
 * - Кнопки: создать, редактировать, удалить
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Search, Plus } from 'lucide-react'
import { AVAILABLE_MODULES } from './project-template-editor/constants'
import { useTemplateList } from './useTemplateList'

type ProjectTemplate = Database['public']['Tables']['project_templates']['Row']

interface FormData {
  name: string
  description: string
  enabled_modules: string[]
}

const DEFAULT_MODULES = ['forms', 'documents', 'finances', 'tasks', 'chats']

export function ProjectTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  // Локальное состояние модулей (специфично для диалога создания)
  const [formEnabledModules, setFormEnabledModules] = useState<string[]>(DEFAULT_MODULES)

  const {
    filteredItems: filteredTemplates,
    isLoading,
    searchQuery,
    setSearchQuery,
    isDialogOpen,
    handleCreate: baseHandleCreate,
    handleCloseDialog,
    handleDelete,
    handleSubmit,
    isSaving,
    confirmDialogProps,
    formData,
    setFormData,
  } = useTemplateList<ProjectTemplate, FormData>({
    tableName: 'project_templates',
    queryKey: 'project-templates',
    workspaceId,
    initialFormData: { name: '', description: '', enabled_modules: DEFAULT_MODULES },
    customCreateFn: async (data: FormData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { error } = await supabase.from('project_templates').insert({
        workspace_id: workspaceId ?? '',
        name: data.name,
        description: data.description || null,
        created_by: user?.id || null,
        enabled_modules: data.enabled_modules,
      })
      if (error) throw error
    },
  })

  const handleCreate = () => {
    setFormEnabledModules(DEFAULT_MODULES)
    baseHandleCreate()
  }

  const handleToggleModule = (moduleId: string) => {
    setFormEnabledModules((prev) => {
      const next = prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
      setFormData((f) => ({ ...f, enabled_modules: next }))
      return next
    })
  }

  const handleEdit = (template: ProjectTemplate) => {
    router.push(`/workspaces/${workspaceId}/settings/templates/project-templates/${template.id}`)
  }

  // handleToggleModule уже синхронизирует formData.enabled_modules,
  // поэтому handleSubmit из useTemplateList работает корректно
  const handleSubmitCreate = handleSubmit

  return (
    <>
      {/* Шапка с поиском и кнопкой создания */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию, описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={handleCreate} className="bg-brand-400 hover:bg-brand-500 text-black">
          <Plus className="w-4 h-4 mr-2" />
          Создать тип проекта
        </Button>
      </div>

      {/* Таблица типов проектов */}
      <div className="border rounded-lg overflow-hidden w-full">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'Ничего не найдено' : 'Пока нет типов проектов. Создайте первый!'}
          </div>
        ) : (
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Название</TableHead>
                <TableHead>Модули</TableHead>
                <TableHead className="text-right w-[80px]">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => {
                const enabledModules = template.enabled_modules || []
                return (
                  <TableRow key={template.id} className="group">
                    <TableCell>
                      <div>
                        <p className="font-medium">{template.name}</p>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5 flex-wrap">
                        {enabledModules.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Нет модулей</span>
                        ) : (
                          enabledModules.map((moduleId: string) => {
                            const mod = AVAILABLE_MODULES.find((m) => m.id === moduleId)
                            if (!mod) return null
                            const Icon = mod.icon
                            return (
                              <Badge
                                key={moduleId}
                                variant="secondary"
                                className="text-xs shrink-0"
                              >
                                <Icon className="w-3 h-3 mr-1" />
                                {mod.label}
                              </Badge>
                            )
                          })
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleEdit(template)}
                          title="Редактировать"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            handleDelete(
                              template.id,
                              'Вы уверены, что хотите удалить этот тип проекта?',
                            )
                          }
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Диалог создания */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать тип проекта</DialogTitle>
            <DialogDescription>Заполните данные для нового типа проекта</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitCreate}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Например: Регистрация компании"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Краткое описание типа проекта"
                />
              </div>

              <div className="space-y-3">
                <Label>Модули проекта</Label>
                <p className="text-xs text-muted-foreground">
                  Выберите, какие модули будут доступны в проектах этого типа
                </p>
                <div className="space-y-2">
                  {AVAILABLE_MODULES.map((module) => {
                    const Icon = module.icon
                    return (
                      <div key={module.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`module-${module.id}`}
                          checked={formEnabledModules.includes(module.id)}
                          onCheckedChange={() => handleToggleModule(module.id)}
                        />
                        <label
                          htmlFor={`module-${module.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                        >
                          <Icon className="w-4 h-4" />
                          {module.label}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Создание...' : 'Создать'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmDialogProps} />
    </>
  )
}
