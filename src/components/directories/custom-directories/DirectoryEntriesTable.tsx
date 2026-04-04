/**
 * Таблица записей справочника
 */

import { Plus, Pencil, Trash2, Archive } from 'lucide-react'
import { useDirectoryFields } from '@/hooks/custom-directories'
import { useDirectoryEntries, extractValue } from '@/hooks/custom-directories'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useEditDialog } from '@/hooks/shared/useEditDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EntryFormDialog } from './EntryFormDialog'
import type { DirectoryEntryWithValues, CustomDirectoryField } from '@/types/customDirectories'
import { EmptyState } from '@/components/ui/empty-state'

interface DirectoryEntriesTableProps {
  directoryId: string
}

function formatCellValue(entry: DirectoryEntryWithValues, field: CustomDirectoryField): string {
  const val = entry.values[field.id]
  if (!val) return '—'

  const extracted = extractValue(val, field.field_type)
  if (extracted === null || extracted === undefined || extracted === '') return '—'

  switch (field.field_type) {
    case 'checkbox':
      return extracted ? 'Да' : 'Нет'
    case 'date': {
      try {
        return new Date(extracted as string).toLocaleDateString('ru-RU')
      } catch {
        return String(extracted)
      }
    }
    case 'multi_select': {
      const arr = extracted as string[]
      return Array.isArray(arr) ? arr.join(', ') : String(extracted)
    }
    default:
      return String(extracted)
  }
}

export function DirectoryEntriesTable({ directoryId }: DirectoryEntriesTableProps) {
  const { fields, isLoading: fieldsLoading } = useDirectoryFields(directoryId)
  const {
    entries,
    isLoading: entriesLoading,
    createEntry,
    updateEntry,
    deleteEntry,
    archiveEntry,
    isCreating,
    isUpdating,
  } = useDirectoryEntries(directoryId)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const {
    open: isDialogOpen,
    editing: editingEntry,
    openCreate: openCreateDialog,
    openEdit: openEditDialog,
    setOpen: setIsDialogOpen,
  } = useEditDialog<DirectoryEntryWithValues>()

  const visibleFields = fields.filter((f) => f.is_visible_in_list)
  const isLoading = fieldsLoading || entriesLoading

  const handleSave = async (values: Record<string, unknown>) => {
    if (editingEntry) {
      await updateEntry({ entryId: editingEntry.id, fields, values })
    } else {
      await createEntry({ fields, values })
    }
    setIsDialogOpen(false)
  }

  const handleDelete = async (entry: DirectoryEntryWithValues) => {
    const ok = await confirm({
      title: 'Удалить запись?',
      description: `Запись "${entry.display_name || 'Без названия'}" будет удалена безвозвратно.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    await deleteEntry(entry.id)
  }

  const handleArchive = async (entry: DirectoryEntryWithValues) => {
    const ok = await confirm({
      title: 'Архивировать запись?',
      description: `Запись "${entry.display_name || 'Без названия'}" будет скрыта из списка.`,
      confirmText: 'Архивировать',
    })
    if (!ok) return
    archiveEntry(entry.id)
  }

  if (fields.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-gray-500">
            <p className="font-medium">Сначала настройте структуру полей</p>
            <p className="text-sm mt-1">
              Перейдите на вкладку «Структура полей» и добавьте хотя бы одно поле
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Записи ({entries.length})</CardTitle>
          <Button size="sm" onClick={openCreateDialog} disabled={fields.length === 0}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить запись
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading || entries.length === 0 ? (
            <EmptyState loading={isLoading} emptyText="Нет записей" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleFields.map((field) => (
                      <TableHead key={field.id}>{field.name}</TableHead>
                    ))}
                    <TableHead className="w-28 text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      {visibleFields.map((field) => (
                        <TableCell key={field.id} className="text-sm">
                          {formatCellValue(entry, field)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(entry)}
                            aria-label="Редактировать"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchive(entry)}
                            aria-label="Архивировать"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(entry)}
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
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <EntryFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        fields={fields}
        editing={editingEntry}
        onSave={handleSave}
        saving={isCreating || isUpdating}
      />
    </div>
  )
}
