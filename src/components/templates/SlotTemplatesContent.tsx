/**
 * SlotTemplatesContent — справочник шаблонов слотов (workspace-scoped).
 *
 * Шаблоны слотов — переиспользуемые «заготовки» (например, «Загранпаспорт»,
 * «Диплом»). Подключаются в шаблон папки или инлайн-слоты шаблона набора
 * документов путём копирования полей (name/description/knowledge_article_id).
 * Не live-reference — изменения в справочнике не затрагивают ранее созданные
 * места использования.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus } from 'lucide-react'
import { knowledgeBaseKeys, knowledgeListKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledge/knowledgeBaseService'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useTemplateList } from './useTemplateList'
import { SlotTemplateDialog, type SlotTemplateFormData } from './SlotTemplateDialog'
import { SlotTemplatesTable } from './SlotTemplatesTable'

type SlotTemplate = Database['public']['Tables']['slot_templates']['Row']

const INITIAL_FORM: SlotTemplateFormData = {
  name: '',
  description: '',
  knowledge_article_id: null,
}

export function SlotTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const {
    filteredItems: filteredTemplates,
    isLoading,
    searchQuery,
    setSearchQuery,
    isDialogOpen,
    editingItem: editingTemplate,
    formData,
    setFormData,
    handleCreate,
    handleEdit: baseHandleEdit,
    handleCloseDialog,
    handleSubmit,
    handleCopy,
    handleDelete,
    isSaving,
    isDeleting,
    isCopying,
    confirmDialogProps,
  } = useTemplateList<SlotTemplate, SlotTemplateFormData>({
    tableName: 'slot_templates',
    queryKey: 'slot-templates',
    workspaceId,
    initialFormData: INITIAL_FORM,
    customCreateFn: async (data) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from('slot_templates')
          .update({
            name: data.name,
            description: data.description || null,
            knowledge_article_id: data.knowledge_article_id || null,
          })
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('slot_templates').insert({
          workspace_id: workspaceId ?? '',
          name: data.name,
          description: data.description || null,
          knowledge_article_id: data.knowledge_article_id || null,
        })
        if (error) throw error
      }
    },
    customCopyFn: async (template) => {
      const { error } = await supabase.from('slot_templates').insert({
        workspace_id: workspaceId ?? '',
        name: `${template.name} (копия)`,
        description: template.description,
        knowledge_article_id: template.knowledge_article_id,
      })
      if (error) throw error
    },
  })

  const handleEdit = (template: SlotTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      knowledge_article_id: template.knowledge_article_id || null,
    })
    baseHandleEdit(template)
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
          onCopy={handleCopy}
          onDelete={(id) => handleDelete(id, 'Удалить шаблон слота? Уже созданные слоты не изменятся.')}
          isCopying={isCopying}
          isDeleting={isDeleting}
        />
      </div>

      <SlotTemplateDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        editingTemplate={editingTemplate}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
      />

      <ConfirmDialog {...confirmDialogProps} />
    </>
  )
}
