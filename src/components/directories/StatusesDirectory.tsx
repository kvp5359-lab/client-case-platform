/**
 * StatusesDirectory — управление справочником статусов
 */

import { useParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { StatusFormDialog } from './StatusFormDialog'
import { StatusesTable } from './StatusesTable'
import { StatusesEntityFilter } from './StatusesEntityFilter'
import { useStatusesDirectory, ENTITY_TYPE_LABELS } from './hooks/useStatusesDirectory'
import { StatusReassignDialog } from '@/components/projects/StatusReassignDialog'
import { EmptyState } from '@/components/ui/empty-state'

export function StatusesDirectory() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const {
    selectedEntityType,
    setSelectedEntityType,
    isDialogOpen,
    setIsDialogOpen,
    editingStatus,
    formData,
    setFormData,
    confirmState,
    handleConfirm,
    handleCancel,
    loading,
    queryError,
    filteredStatuses,
    deleteMutation,
    saveMutation,
    reassignAndDeleteMutation,
    reassignFor,
    setReassignFor,
    reassignCount,
    handleDragEnd,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
  } = useStatusesDirectory(workspaceId)

  const error = queryError ? 'Не удалось загрузить статусы' : null

  return (
    <div className="space-y-4">
      <StatusesEntityFilter
        selectedEntityType={selectedEntityType}
        onEntityTypeChange={setSelectedEntityType}
      />

      {/* Ошибка */}
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Таблица статусов */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">
              Статусы: {ENTITY_TYPE_LABELS[selectedEntityType]}
            </CardTitle>
            <CardDescription>{filteredStatuses.length} статус(ов)</CardDescription>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {loading || filteredStatuses.length === 0 ? (
            <EmptyState
              loading={loading}
              emptyText={`Нет статусов для ${ENTITY_TYPE_LABELS[selectedEntityType].toLowerCase()}`}
            />
          ) : (
            <StatusesTable
              statuses={filteredStatuses}
              onEdit={openEditDialog}
              onDelete={handleDelete}
              onDragEnd={handleDragEnd}
              isDeleting={deleteMutation.isPending}
            />
          )}
        </CardContent>
      </Card>

      {/* Диалог подтверждения удаления */}
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Диалог реассайна — для project-статусов с активными проектами */}
      <StatusReassignDialog
        open={!!reassignFor}
        onOpenChange={(o) => !o && setReassignFor(null)}
        statusToDelete={reassignFor}
        affectedProjectsCount={reassignCount}
        // Кандидаты — все project-статусы воркспейса (общие + по шаблонам);
        // удаляемый отфильтруется внутри диалога.
        candidates={filteredStatuses}
        onConfirm={(replacementId) => {
          if (!reassignFor) return
          reassignAndDeleteMutation.mutate({ statusId: reassignFor.id, replacementId })
        }}
        isPending={reassignAndDeleteMutation.isPending}
      />

      {/* Диалог создания/редактирования */}
      <StatusFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingStatus={editingStatus}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        saving={saveMutation.isPending}
        entityTypeLabel={ENTITY_TYPE_LABELS[selectedEntityType]}
      />
    </div>
  )
}
