/**
 * DocumentKitTemplatesContent — список шаблонов наборов документов
 *
 * Использует useTemplateList для CRUD-операций.
 * Кастомная загрузка — с подсчётом папок в каждом наборе.
 */

import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Pencil, Copy, Trash2, Search, Plus, Package } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useTemplateList } from './useTemplateList'

type DocumentKitTemplate = Database['public']['Tables']['document_kit_templates']['Row']

interface DocumentKitWithFolders extends DocumentKitTemplate {
  folders_count: number
}

const INITIAL_FORM = { name: '', description: '' }

export function DocumentKitTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  const {
    filteredItems: filteredKits,
    isLoading,
    searchQuery,
    setSearchQuery,
    isDialogOpen,
    setIsDialogOpen,
    formData,
    setFormData,
    handleCreate,
    handleCloseDialog,
    handleSubmit,
    handleCopy,
    handleDelete,
    isSaving,
    isDeleting,
    isCopying,
    confirmDialogProps,
  } = useTemplateList<DocumentKitWithFolders, typeof INITIAL_FORM>({
    tableName: 'document_kit_templates',
    queryKey: 'document-kit-templates',
    workspaceId,
    initialFormData: INITIAL_FORM,
    customQueryFn: async () => {
      if (!workspaceId) return []
      try {
        const { data, error } = await supabase
          .from('document_kit_templates')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })

        if (error) throw error

        // Z5-02: Батчевый подсчёт папок одним запросом вместо N+1
        const kitIds = (data || []).map((kit) => kit.id)
        const folderCountsMap: Record<string, number> = {}

        if (kitIds.length > 0) {
          const { data: allFolders } = await supabase
            .from('document_kit_template_folders')
            .select('kit_template_id')
            .in('kit_template_id', kitIds)

          if (allFolders) {
            for (const folder of allFolders) {
              folderCountsMap[folder.kit_template_id] =
                (folderCountsMap[folder.kit_template_id] || 0) + 1
            }
          }
        }

        const kitsWithCounts: DocumentKitWithFolders[] = (data || []).map((kit) => ({
          ...kit,
          folders_count: folderCountsMap[kit.id] || 0,
        }))

        return kitsWithCounts
      } catch (error) {
        logger.error('Ошибка загрузки шаблонов наборов документов:', error)
        throw error
      }
    },
    customCopyFn: async (kit) => {
      const { data: newKit, error: createError } = await supabase
        .from('document_kit_templates')
        .insert({
          workspace_id: workspaceId ?? '',
          name: `${kit.name} (копия)`,
          description: kit.description,
        })
        .select()
        .single()

      if (createError) throw createError

      const { data: folders } = await supabase
        .from('document_kit_template_folders')
        .select('*')
        .eq('kit_template_id', kit.id)

      if (folders && folders.length > 0) {
        const { error: foldersError } = await supabase.from('document_kit_template_folders').insert(
          folders.map((f) => ({
            kit_template_id: newKit.id,
            folder_template_id: f.folder_template_id,
            order_index: f.order_index,
            name: f.name,
          })),
        )
        if (foldersError) throw foldersError
      }
    },
  })

  const handleEdit = (kit: DocumentKitTemplate) => {
    router.push(`/workspaces/${workspaceId}/settings/templates/document-kit-templates/${kit.id}`)
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
          Создать набор
        </Button>
      </div>

      {/* Таблица наборов */}
      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : filteredKits.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'Ничего не найдено' : 'Пока нет наборов документов. Создайте первый!'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70%]">Название</TableHead>
                <TableHead className="text-right">Папок</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKits.map((kit) => (
                <TableRow key={kit.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-blue-500 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{kit.name}</p>
                        {kit.description && (
                          <p className="text-sm text-muted-foreground">{kit.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleEdit(kit)}
                          title="Редактировать"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleCopy(kit)}
                          disabled={isCopying}
                          title="Копировать"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() =>
                            handleDelete(
                              kit.id,
                              'Вы уверены, что хотите удалить этот набор документов?',
                            )
                          }
                          disabled={isDeleting}
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-muted-foreground">{kit.folders_count}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Диалог создания */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Создать набор документов</DialogTitle>
            <DialogDescription>
              Заполните основные данные набора. Папки можно добавить после создания.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: Регистрация ООО, Покупка квартиры"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Краткое описание назначения набора"
                  rows={2}
                />
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
