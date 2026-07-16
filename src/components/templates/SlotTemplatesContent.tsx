/**
 * SlotTemplatesContent — справочник шаблонов слотов (workspace-scoped).
 *
 * Шаблоны слотов — переиспользуемые «заготовки» (например, «Загранпаспорт»,
 * «Диплом»). Подключаются в шаблон папки или инлайн-слоты шаблона набора
 * документов путём копирования полей (name/description/knowledge_article_id/
 * ai_naming_prompt/ai_check_prompt). Не live-reference — изменения
 * в справочнике не затрагивают ранее созданные места использования.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { knowledgeBaseKeys, knowledgeListKeys, slotTemplatesKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledge/knowledgeBaseService'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { EditSlotDialog, type SlotDialogValue } from './EditSlotDialog'
import { SlotTemplatesTable } from './SlotTemplatesTable'
import {
  useSlotTemplates,
  insertSlotTemplate,
  slotTemplateFields,
  type SlotTemplate,
} from './useSlotTemplates'

export function SlotTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [searchQuery, setSearchQuery] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<SlotTemplate | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const queryKey = slotTemplatesKeys.byWorkspace(workspaceId ?? '')

  const { data: templates = [], isLoading } = useSlotTemplates(workspaceId)

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const saveMutation = useMutation({
    mutationFn: async (data: SlotDialogValue) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from('slot_templates')
          .update(slotTemplateFields(data))
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        await insertSlotTemplate(workspaceId, data)
      }
    },
    onSuccess: () => {
      invalidate()
      setIsDialogOpen(false)
      setEditingTemplate(null)
    },
    onError: (error) => {
      logger.error('Ошибка сохранения шаблона слота:', error)
      toast.error('Не удалось сохранить шаблон слота')
    },
  })

  const copyMutation = useMutation({
    mutationFn: async (template: SlotTemplate) => {
      await insertSlotTemplate(workspaceId, {
        ...template,
        name: `${template.name} (копия)`,
      })
    },
    onSuccess: invalidate,
    onError: (error) => {
      logger.error('Ошибка копирования шаблона слота:', error)
      toast.error('Не удалось скопировать шаблон')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // supabase-js не бросает на ошибку, а возвращает её в результате — без
      // явной проверки отказ RLS или сбой сети прошли бы как успех, и порядок
      // молча откатился бы на invalidate без единого слова пользователю.
      const results = await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('slot_templates').update({ sort_order: idx }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    // Оптимистично переставляем сразу: иначе строка возвращалась бы на место
    // до ответа сервера.
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<SlotTemplate[]>(queryKey)
      if (prev) {
        const byId = new Map(prev.map((t) => [t.id, t]))
        const next = orderedIds
          .map((id) => byId.get(id))
          .filter((t): t is SlotTemplate => !!t)
        queryClient.setQueryData<SlotTemplate[]>(queryKey, next)
      }
      return { prev }
    },
    onError: (error, _ids, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev)
      logger.error('Ошибка сортировки шаблонов слотов:', error)
      toast.error('Не удалось сохранить порядок')
    },
    onSettled: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('slot_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (error) => {
      logger.error('Ошибка удаления шаблона слота:', error)
      toast.error('Не удалось удалить шаблон')
    },
  })

  const filteredTemplates = templates.filter((t) => {
    const q = searchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false)
    )
  })

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (template: SlotTemplate) => {
    setEditingTemplate(template)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Подтвердите удаление',
      description: 'Удалить шаблон слота? Уже созданные слоты не изменятся.',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  // Данные для ArticleTreePicker — статьи/группы БЗ
  const { data: articles = [] } = useQuery({
    queryKey: knowledgeListKeys.articlesList(workspaceId),
    queryFn: () => getArticlesByWorkspace(workspaceId!),
    enabled: !!workspaceId,
  })

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

  const { data: articleGroups = [] } = useQuery({
    queryKey: knowledgeListKeys.articleGroupLinks(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_groups')
        .select('article_id, group_id')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })

  return (
    <>
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
          Создать шаблон слота
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <SlotTemplatesTable
          templates={filteredTemplates}
          articles={articles}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onEdit={handleEdit}
          onCopy={(t) => copyMutation.mutate(t)}
          onDelete={handleDelete}
          onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
          isCopying={copyMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      </div>

      <EditSlotDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDialogOpen(false)
            setEditingTemplate(null)
          }
        }}
        instanceKey={editingTemplate?.id}
        title={editingTemplate ? 'Редактировать шаблон слота' : 'Создать шаблон слота'}
        withComment
        value={
          editingTemplate
            ? {
                name: editingTemplate.name,
                comment: editingTemplate.comment,
                description: editingTemplate.description,
                knowledge_article_id: editingTemplate.knowledge_article_id,
                ai_naming_prompt: editingTemplate.ai_naming_prompt,
                ai_check_prompt: editingTemplate.ai_check_prompt,
              }
            : null
        }
        isPending={saveMutation.isPending}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        onSubmit={(data) => saveMutation.mutate(data)}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
