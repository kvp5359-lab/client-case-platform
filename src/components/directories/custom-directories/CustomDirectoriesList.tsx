/**
 * Список пользовательских справочников workspace
 */

import { useRouter, useParams } from 'next/navigation'
import { Plus, Pencil, Archive, BookOpen, Trash2 } from 'lucide-react'
import { useCustomDirectories } from '@/hooks/custom-directories'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useEditDialog } from '@/hooks/shared/useEditDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DirectoryFormDialog } from './DirectoryFormDialog'
import type { CustomDirectory } from '@/types/customDirectories'
import { EmptyState } from '@/components/ui/empty-state'
import { ColorDot } from '@/components/ui/color-dot'

export function CustomDirectoriesList() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const {
    directories,
    isLoading,
    error,
    createDirectory,
    updateDirectory,
    archiveDirectory,
    deleteDirectory,
    isCreating,
    isUpdating,
  } = useCustomDirectories()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const {
    open: isDialogOpen,
    editing: editingDirectory,
    openCreate: openCreateDialog,
    openEdit: openEditDialog,
    setOpen: setIsDialogOpen,
  } = useEditDialog<CustomDirectory>()

  const handleSave = async (data: {
    name: string
    description?: string
    icon?: string
    color?: string
  }) => {
    if (editingDirectory) {
      updateDirectory({ id: editingDirectory.id, data })
    } else {
      await createDirectory(data)
    }
    setIsDialogOpen(false)
  }

  const handleArchive = async (dir: CustomDirectory) => {
    const ok = await confirm({
      title: 'Архивировать справочник?',
      description: `Справочник "${dir.name}" будет скрыт. Все записи сохранятся, справочник можно будет восстановить.`,
      confirmText: 'Архивировать',
    })
    if (!ok) return
    archiveDirectory(dir.id)
  }

  const handleDelete = async (dir: CustomDirectory) => {
    const ok = await confirm({
      title: 'Удалить справочник?',
      description: `Справочник "${dir.name}" и все его записи будут удалены безвозвратно.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    await deleteDirectory(dir.id)
  }

  const openDirectory = (dir: CustomDirectory) => {
    router.push(`/workspaces/${workspaceId}/settings/directories/custom/${dir.id}`)
  }

  const errorMessage = error ? 'Не удалось загрузить справочники' : null

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">Пользовательские справочники</CardTitle>
            <CardDescription>
              Создавайте справочники с произвольной структурой полей
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Создать
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <EmptyState loading />
          ) : directories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Нет справочников</p>
              <p className="text-sm mt-1">
                Создайте первый справочник — например, «Юристы», «Типы дел» или «Суды»
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead className="w-28 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directories.map((dir) => (
                  <TableRow
                    key={dir.id}
                    className="cursor-pointer"
                    onClick={() => openDirectory(dir)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ColorDot color={dir.color} />
                        <span className="font-medium">{dir.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {dir.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(dir)}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchive(dir)}
                          aria-label="Архивировать"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(dir)}
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

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <DirectoryFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editing={editingDirectory}
        onSave={handleSave}
        saving={isCreating || isUpdating}
      />
    </div>
  )
}
