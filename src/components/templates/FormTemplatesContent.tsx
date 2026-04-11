/**
 * FormTemplatesContent — список шаблонов анкет
 *
 * Отображает:
 * - Поиск по названию
 * - Таблица с шаблонами (название, техническое имя, кол-во полей)
 * - Кнопки: создать, редактировать, копировать, удалить
 *
 * Мутации и D&D вынесены в useFormTemplateMutations
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { Pencil, Copy, Trash2, Search, Plus, GripVertical } from 'lucide-react'
import { useFormTemplateMutations } from './useFormTemplateMutations'

type FormTemplate = Database['public']['Tables']['form_templates']['Row']

export function FormTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')

  const {
    templates,
    isLoading,
    createMutation,
    copyMutation,
    deleteMutation,
    draggedTemplateId,
    dragOverTemplateId,
    dragOverPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useFormTemplateMutations(workspaceId)

  // Фильтрация шаблонов
  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Обработчики
  const handleCreate = () => {
    setFormName('')
    setFormDescription('')
    setIsCreateDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false)
    setFormName('')
    setFormDescription('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    createMutation.mutate(
      { name: formName, description: formDescription },
      { onSuccess: handleCloseDialog },
    )
  }

  const handleCopy = (template: FormTemplate) => {
    copyMutation.mutate(template)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить шаблон анкеты?',
      description: 'Вы уверены, что хотите удалить этот шаблон анкеты?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  const handleOpenTemplate = (template: FormTemplate) => {
    router.push(`/workspaces/${workspaceId}/settings/templates/form-templates/${template.id}`)
  }

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
          Создать шаблон анкеты
        </Button>
      </div>

      {/* Таблица шаблонов */}
      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'Ничего не найдено' : 'Пока нет шаблонов анкет. Создайте первый!'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70%]">Название</TableHead>
                <TableHead className="text-right">Полей</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => {
                const isDragging = draggedTemplateId === template.id
                const isOver = dragOverTemplateId === template.id

                return (
                  <TableRow
                    key={template.id}
                    className={`group transition-colors ${
                      isDragging
                        ? 'opacity-40 bg-blue-50'
                        : isOver
                          ? dragOverPosition === 'top'
                            ? 'bg-blue-100 border-t-2 border-t-blue-500'
                            : 'bg-blue-100 border-b-2 border-b-blue-500'
                          : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, template.id)}
                    onDragOver={(e) => handleDragOver(e, template.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, template)}
                    onDragEnd={handleDragEnd}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* Иконка перетаскивания */}
                        <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>

                        <div className="flex-1">
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                          )}
                        </div>
                        {/* Кнопки действий — появляются при наведении */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenTemplate(template)}
                            title="Редактировать"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleCopy(template)}
                            disabled={copyMutation.isPending}
                            title="Копировать"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(template.id)}
                            disabled={deleteMutation.isPending}
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground">{template.fields_count}</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Диалог создания */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать шаблон анкеты</DialogTitle>
            <DialogDescription>Заполните данные для нового шаблона анкеты</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Например: Анкета для ВНЖ"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Input
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Краткое описание шаблона"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Отмена
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Создание...' : 'Создать'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
