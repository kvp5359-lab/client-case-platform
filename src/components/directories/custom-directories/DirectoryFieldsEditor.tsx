/**
 * Конструктор полей справочника — добавление, редактирование, удаление полей
 */

import { Plus, Pencil, Trash2, GripVertical, Star } from 'lucide-react'
import { useDirectoryFields } from '@/hooks/custom-directories'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useEditDialog } from '@/hooks/shared/useEditDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FieldFormDialog } from './FieldFormDialog'
import { FIELD_TYPE_LABELS } from '@/types/customDirectories'
import { EmptyState } from '@/components/ui/empty-state'
import type {
  CustomDirectoryField,
  CustomDirectoryFieldType,
  DirectoryFieldOptions,
} from '@/types/customDirectories'

interface DirectoryFieldsEditorProps {
  directoryId: string
}

export function DirectoryFieldsEditor({ directoryId }: DirectoryFieldsEditorProps) {
  const { fields, isLoading, createField, updateField, deleteField } =
    useDirectoryFields(directoryId)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const {
    open: isDialogOpen,
    editing: editingField,
    openCreate: openCreateDialog,
    openEdit: openEditDialog,
    setOpen: setIsDialogOpen,
  } = useEditDialog<CustomDirectoryField>()

  const hasPrimary = fields.some((f) => f.is_primary)

  const handleSave = async (data: {
    name: string
    field_type: CustomDirectoryFieldType
    is_primary: boolean
    is_required: boolean
    is_unique: boolean
    is_visible_in_list: boolean
    options: DirectoryFieldOptions
  }) => {
    if (editingField) {
      updateField({
        id: editingField.id,
        data: {
          name: data.name,
          field_type: data.field_type,
          is_primary: data.is_primary,
          is_required: data.is_required,
          is_unique: data.is_unique,
          is_visible_in_list: data.is_visible_in_list,
          options: data.options as Record<string, unknown>,
        },
      })
    } else {
      await createField(data)
    }
    setIsDialogOpen(false)
  }

  const handleDelete = async (field: CustomDirectoryField) => {
    const ok = await confirm({
      title: 'Удалить поле?',
      description: `Поле "${field.name}" и все его значения в записях будут удалены. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    await deleteField(field.id)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Поля справочника</CardTitle>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить поле
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || fields.length === 0 ? (
            <EmptyState loading={isLoading} emptyText="Нет полей" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Свойства</TableHead>
                  <TableHead className="w-20 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{field.name}</span>
                        {field.is_primary && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Star className="h-3 w-3" />
                            Первичное
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {FIELD_TYPE_LABELS[field.field_type]}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {field.is_required && (
                          <Badge variant="outline" className="text-xs">
                            Обязательное
                          </Badge>
                        )}
                        {field.is_unique && (
                          <Badge variant="outline" className="text-xs">
                            Уникальное
                          </Badge>
                        )}
                        {!field.is_visible_in_list && (
                          <Badge variant="outline" className="text-xs text-gray-400">
                            Скрыто в таблице
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(field)}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(field)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!hasPrimary && fields.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          <p className="font-medium">Нет первичного поля</p>
          <p className="mt-1">
            Рекомендуется отметить одно поле как первичное — оно будет использоваться как название
            записи при отображении в таблицах и выпадающих списках.
          </p>
        </div>
      )}

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <FieldFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editing={editingField}
        onSave={handleSave}
        hasPrimaryField={hasPrimary}
        directoryId={directoryId}
      />
    </div>
  )
}
