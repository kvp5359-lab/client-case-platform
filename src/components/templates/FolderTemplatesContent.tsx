/**
 * FolderTemplatesContent — список шаблонов папок для документов
 *
 * Использует useTemplateList для CRUD-операций.
 * Кастомное копирование — включает слоты.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, Settings2 } from 'lucide-react'
import { knowledgeBaseKeys, folderTemplateKeys, knowledgeListKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledge/knowledgeBaseService'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FolderTemplateDialog } from './FolderTemplateDialog'
import type { FolderFormData } from './FolderTemplateDialog'
import { useTemplateList } from './useTemplateList'
import { FolderTemplatesTable } from './FolderTemplatesTable'
import { DefaultPromptsDialog } from './DefaultPromptsDialog'

type FolderTemplate = Database['public']['Tables']['folder_templates']['Row']

const INITIAL_FORM: FolderFormData = {
  name: '',
  description: '',
  ai_naming_prompt: '',
  ai_check_prompt: '',
  knowledge_article_id: null,
}

export function FolderTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [activeTab, setActiveTab] = useState('description')
  const [defaultPromptsOpen, setDefaultPromptsOpen] = useState(false)

  const {
    filteredItems: filteredTemplates,
    isLoading,
    searchQuery,
    setSearchQuery,
    isDialogOpen,
    editingItem: editingTemplate,
    formData,
    setFormData,
    handleCreate: baseHandleCreate,
    handleEdit: baseHandleEdit,
    handleCloseDialog: baseHandleCloseDialog,
    handleSubmit,
    handleCopy,
    handleDelete,
    isSaving,
    isDeleting,
    isCopying,
    confirmDialogProps,
  } = useTemplateList<FolderTemplate, FolderFormData>({
    tableName: 'folder_templates',
    queryKey: 'folder-templates',
    workspaceId,
    initialFormData: INITIAL_FORM,
    customCreateFn: async (data) => {
      if (editingTemplate) {
        const { error } = await supabase
          .from('folder_templates')
          .update({
            name: data.name,
            description: data.description || null,
            ai_naming_prompt: data.ai_naming_prompt || null,
            ai_check_prompt: data.ai_check_prompt || null,
            knowledge_article_id: data.knowledge_article_id || null,
          })
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('folder_templates').insert({
          workspace_id: workspaceId ?? '',
          name: data.name,
          description: data.description || null,
          ai_naming_prompt: data.ai_naming_prompt || null,
          ai_check_prompt: data.ai_check_prompt || null,
          knowledge_article_id: data.knowledge_article_id || null,
        })
        if (error) throw error
      }
    },
    customCopyFn: async (template) => {
      const { data: newTemplate, error } = await supabase
        .from('folder_templates')
        .insert({
          workspace_id: workspaceId ?? '',
          name: `${template.name} (копия)`,
          description: template.description,
          ai_naming_prompt: template.ai_naming_prompt,
          ai_check_prompt: template.ai_check_prompt,
          knowledge_article_id: template.knowledge_article_id,
          settings: template.settings,
        })
        .select('id')
        .single()

      if (error) throw error

      if (newTemplate) {
        const { data: sourceSlots } = await supabase
          .from('folder_template_slots')
          .select('*')
          .eq('folder_template_id', template.id)
          .order('sort_order')

        if (sourceSlots && sourceSlots.length > 0) {
          const slotsToCreate = sourceSlots.map((slot) => ({
            folder_template_id: newTemplate.id,
            workspace_id: workspaceId ?? '',
            name: slot.name,
            sort_order: slot.sort_order,
          }))
          const { error: slotsError } = await supabase
            .from('folder_template_slots')
            .insert(slotsToCreate)
          if (slotsError) throw slotsError
        }
      }
    },
    invalidateOnClose: ['folder-template-slot-counts'],
  })

  // Подсчёт слотов для каждого шаблона
  const { data: slotCounts = {} } = useQuery({
    queryKey: folderTemplateKeys.slotCounts(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return {}
      const { data, error } = await supabase
        .from('folder_template_slots')
        .select('folder_template_id')
        .eq('workspace_id', workspaceId)

      if (error) throw error

      const counts: Record<string, number> = {}
      for (const slot of data || []) {
        counts[slot.folder_template_id] = (counts[slot.folder_template_id] || 0) + 1
      }
      return counts
    },
    enabled: !!workspaceId,
  })

  // Статьи базы знаний для привязки к шаблонам папок (отдельный ключ — без join)
  const { data: articles = [] } = useQuery({
    queryKey: knowledgeListKeys.articlesList(workspaceId),
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

  // Обёртки с управлением activeTab
  const handleCreate = () => {
    setActiveTab('description')
    baseHandleCreate()
  }

  const handleEdit = (template: FolderTemplate) => {
    setActiveTab('description')
    setFormData({
      name: template.name,
      description: template.description || '',
      ai_naming_prompt: template.ai_naming_prompt || '',
      ai_check_prompt: template.ai_check_prompt || '',
      knowledge_article_id: template.knowledge_article_id || null,
    })
    baseHandleEdit(template)
  }

  const handleCloseDialog = () => {
    setActiveTab('description')
    baseHandleCloseDialog()
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
        <Button variant="outline" onClick={() => setDefaultPromptsOpen(true)}>
          <Settings2 className="w-4 h-4 mr-2" />
          Промпты по умолчанию
        </Button>
        <Button onClick={handleCreate} className="bg-brand-400 hover:bg-brand-500 text-black">
          <Plus className="w-4 h-4 mr-2" />
          Создать шаблон папки
        </Button>
      </div>

      {/* Таблица шаблонов */}
      <div className="border rounded-lg overflow-hidden">
        <FolderTemplatesTable
          templates={filteredTemplates}
          slotCounts={slotCounts}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onEdit={handleEdit}
          onCopy={handleCopy}
          onDelete={(id) => handleDelete(id, 'Вы уверены, что хотите удалить этот шаблон папки?')}
          isCopying={isCopying}
          isDeleting={isDeleting}
        />
      </div>

      {/* Диалог создания/редактирования */}
      <FolderTemplateDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        editingTemplate={editingTemplate}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        workspaceId={workspaceId}
      />

      <ConfirmDialog {...confirmDialogProps} />

      <DefaultPromptsDialog
        open={defaultPromptsOpen}
        onOpenChange={setDefaultPromptsOpen}
        workspaceId={workspaceId}
      />
    </>
  )
}
