/**
 * DocumentKitTemplateEditorPage — страница редактирования шаблона набора документов
 *
 * Позволяет:
 * - Редактировать название и описание шаблона
 * - Добавлять/удалять шаблоны папок в набор
 * - Менять порядок папок drag & drop
 *
 * Модуляризован: хуки и подкомпоненты вынесены в document-kit-template-editor/
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledgeBaseService'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeTable, NativeTableBody } from '@/components/ui/native-table'
import { ArrowLeft, Plus, Folder } from 'lucide-react'

import {
  useDocumentKitTemplate,
  useKitFolders,
  useKitFolderSlots,
  useAvailableFolderTemplates,
  useDocumentKitTemplateMutations,
  useFolderDragDrop,
  KitHeader,
  AddFoldersDialog,
  DraggableFolderRow,
  EditKitFolderDialog,
  KitFolder,
} from './document-kit-template-editor'

export function DocumentKitTemplateEditorPage() {
  const { workspaceId, kitId } = useParams<{ workspaceId: string; kitId: string }>()
  const router = useRouter()

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [isAddFolderDialogOpen, setIsAddFolderDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<KitFolder | null>(null)
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = useState(false)

  // Загрузка данных
  const { data: kit, isLoading: isKitLoading } = useDocumentKitTemplate(kitId)
  const { data: kitFolders = [], isLoading: isFoldersLoading } = useKitFolders(kitId)
  const { data: availableFolders = [] } = useAvailableFolderTemplates(
    workspaceId,
    isAddFolderDialogOpen,
  )
  const { data: slotsMap = {} } = useKitFolderSlots(kitFolders.map((f) => f.id))
  const { data: articles = [] } = useQuery({
    queryKey: ['knowledge-articles-list', workspaceId],
    queryFn: () => getArticlesByWorkspace(workspaceId!),
    enabled: !!workspaceId,
  })

  // Группы базы знаний (для иерархического отображения)
  const { data: groups = [] } = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })

  // Связи статей с группами
  const { data: articleGroups = [] } = useQuery({
    queryKey: ['knowledge-article-groups', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_groups')
        .select('article_id, group_id')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })

  // Мутации
  const {
    updateKitMutation,
    addFoldersMutation,
    createFolderMutation,
    updateFolderMutation,
    removeFolderMutation,
    reorderFoldersMutation,
  } = useDocumentKitTemplateMutations({
    kitId,
    kitFolders,
    onAddFoldersSuccess: () => setIsAddFolderDialogOpen(false),
  })

  // Drag & Drop
  const dragDrop = useFolderDragDrop({
    kitFolders,
    onReorder: (updates) => reorderFoldersMutation.mutate(updates),
  })

  const isLoading = isKitLoading || isFoldersLoading

  // Обработчики
  const handleBack = () => {
    router.push(`/workspaces/${workspaceId}/settings/templates/document-kit-templates`)
  }

  const handleRemoveFolder = async (kitFolderId: string) => {
    const ok = await confirm({
      title: 'Удалить папку из набора?',
      description: 'Удалить эту папку из набора?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    removeFolderMutation.mutate(kitFolderId)
  }

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Хлебные крошки + заголовок */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
          ) : !kit ? (
            <div className="text-center py-12 text-muted-foreground">Шаблон набора не найден</div>
          ) : (
            <>
              {/* Заголовок шаблона */}
              <KitHeader
                kit={kit}
                isPending={updateKitMutation.isPending}
                onSave={(data) => updateKitMutation.mutateAsync(data)}
              />

              {/* Таблица папок набора */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Папки в наборе</h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsAddFolderDialogOpen(true)}
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Из шаблона
                    </Button>
                    <Button onClick={() => setIsCreateFolderDialogOpen(true)} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Создать папку
                    </Button>
                  </div>
                </div>

                {kitFolders.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Folder className="w-12 h-12 mx-auto mb-4 opacity-50 text-amber-500" />
                      <p className="mb-4">В этом наборе пока нет папок</p>
                      <div className="flex items-center gap-2 justify-center">
                        <Button variant="outline" onClick={() => setIsAddFolderDialogOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Из шаблона
                        </Button>
                        <Button onClick={() => setIsCreateFolderDialogOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Создать папку
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <NativeTable
                      columns={[
                        { key: 'grip', width: '40px' },
                        { key: 'name', width: '60%' },
                        { key: 'description', width: '40%' },
                      ]}
                    >
                      <NativeTableBody>
                        {kitFolders.map((folder, idx) => (
                          <DraggableFolderRow
                            key={folder.id}
                            folder={folder}
                            index={idx + 1}
                            slots={slotsMap[folder.id]}
                            isDragging={dragDrop.draggedFolderId === folder.id}
                            isOver={dragDrop.dragOverFolderId === folder.id}
                            overPosition={dragDrop.dragOverPosition}
                            onDragStart={dragDrop.handleDragStart}
                            onDragOver={dragDrop.handleDragOver}
                            onDragLeave={dragDrop.handleDragLeave}
                            onDrop={dragDrop.handleDrop}
                            onDragEnd={dragDrop.handleDragEnd}
                            onEdit={setEditingFolder}
                            onRemove={handleRemoveFolder}
                          />
                        ))}
                      </NativeTableBody>
                    </NativeTable>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Диалог добавления папок */}
      <AddFoldersDialog
        open={isAddFolderDialogOpen}
        onOpenChange={setIsAddFolderDialogOpen}
        availableFolders={availableFolders}
        isPending={addFoldersMutation.isPending}
        onSubmit={(folderIds) => addFoldersMutation.mutate(folderIds)}
      />

      {/* Диалог создания папки вручную */}
      <EditKitFolderDialog
        key={isCreateFolderDialogOpen ? 'create-open' : 'create-closed'}
        open={isCreateFolderDialogOpen}
        onOpenChange={setIsCreateFolderDialogOpen}
        isPending={createFolderMutation.isPending}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        onSubmit={(data) => {
          createFolderMutation.mutate(data, {
            onSuccess: () => setIsCreateFolderDialogOpen(false),
          })
        }}
      />

      {/* Диалог редактирования папки */}
      <EditKitFolderDialog
        key={editingFolder?.id ?? 'edit-closed'}
        open={!!editingFolder}
        onOpenChange={(open) => {
          if (!open) setEditingFolder(null)
        }}
        folder={editingFolder}
        isPending={updateFolderMutation.isPending}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        onSubmit={(data) => {
          if (!data.id) return
          updateFolderMutation.mutate(data as Parameters<typeof updateFolderMutation.mutate>[0], {
            onSuccess: () => setEditingFolder(null),
          })
        }}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </WorkspaceLayout>
  )
}
