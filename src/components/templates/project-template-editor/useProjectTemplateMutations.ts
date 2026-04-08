/**
 * Мутации для редактора типа проекта
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'

interface UseProjectTemplateMutationsParams {
  templateId: string | undefined
  linkedForms: FormTemplateWithRelation[]
  linkedDocKits: DocumentKitTemplateWithRelation[]
  linkedKnowledgeArticles: KnowledgeArticleWithRelation[]
  linkedKnowledgeGroups: KnowledgeGroupWithRelation[]
  onNameSaved?: () => void
  onFormsAdded?: () => void
  onDocKitsAdded?: () => void
  onKnowledgeArticlesAdded?: () => void
  onKnowledgeGroupsAdded?: () => void
}

export function useProjectTemplateMutations({
  templateId,
  linkedForms,
  linkedDocKits,
  linkedKnowledgeArticles,
  linkedKnowledgeGroups,
  onNameSaved,
  onFormsAdded,
  onDocKitsAdded,
  onKnowledgeArticlesAdded,
  onKnowledgeGroupsAdded,
}: UseProjectTemplateMutationsParams) {
  const queryClient = useQueryClient()

  // Обновление названия и описания
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { error } = await supabase
        .from('project_templates')
        .update({
          name: data.name,
          description: data.description || null,
        })
        .eq('id', templateId ?? '')

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template', templateId] })
      onNameSaved?.()
    },
    onError: () => {
      toast.error('Не удалось обновить шаблон')
    },
  })

  // Обновление модулей
  const updateModulesMutation = useMutation({
    mutationFn: async (modules: string[]) => {
      const { error } = await supabase
        .from('project_templates')
        .update({
          enabled_modules: modules,
        })
        .eq('id', templateId ?? '')

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template', templateId] })
    },
    onError: () => {
      toast.error('Не удалось обновить модули')
    },
  })

  // Добавление шаблонов анкет
  const addFormsMutation = useMutation({
    mutationFn: async (formIds: string[]) => {
      const maxOrder =
        linkedForms.length > 0 ? Math.max(...linkedForms.map((f) => f.order_index)) : -1

      const inserts = formIds.map((formId, index) => ({
        project_template_id: templateId ?? '',
        form_template_id: formId,
        order_index: maxOrder + index + 1,
      }))

      const { error } = await supabase.from('project_template_forms').insert(inserts)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-forms', templateId] })
      onFormsAdded?.()
    },
    onError: () => {
      toast.error('Не удалось добавить анкеты')
    },
  })

  // Удаление шаблона анкеты
  const removeFormMutation = useMutation({
    mutationFn: async (relationId: string) => {
      const { error } = await supabase.from('project_template_forms').delete().eq('id', relationId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-forms', templateId] })
    },
    onError: () => {
      toast.error('Не удалось удалить анкету')
    },
  })

  // Добавление шаблонов наборов документов
  const addDocKitsMutation = useMutation({
    mutationFn: async (docKitIds: string[]) => {
      const maxOrder =
        linkedDocKits.length > 0 ? Math.max(...linkedDocKits.map((d) => d.order_index)) : -1

      const inserts = docKitIds.map((docKitId, index) => ({
        project_template_id: templateId ?? '',
        document_kit_template_id: docKitId,
        order_index: maxOrder + index + 1,
      }))

      const { error } = await supabase.from('project_template_document_kits').insert(inserts)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-document-kits', templateId] })
      onDocKitsAdded?.()
    },
    onError: () => {
      toast.error('Не удалось добавить наборы документов')
    },
  })

  // Удаление шаблона набора документов
  const removeDocKitMutation = useMutation({
    mutationFn: async (relationId: string) => {
      const { error } = await supabase
        .from('project_template_document_kits')
        .delete()
        .eq('id', relationId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-document-kits', templateId] })
    },
    onError: () => {
      toast.error('Не удалось удалить набор документов')
    },
  })

  // Добавление статей базы знаний (точечный доступ)
  const addKnowledgeArticlesMutation = useMutation({
    mutationFn: async (articleIds: string[]) => {
      const inserts = articleIds.map((articleId) => ({
        project_template_id: templateId ?? '',
        article_id: articleId,
      }))

      const { error } = await supabase.from('knowledge_article_templates').insert(inserts)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-article-templates', templateId],
      })
      onKnowledgeArticlesAdded?.()
    },
    onError: () => {
      toast.error('Не удалось добавить статьи')
    },
  })

  // Удаление статьи базы знаний
  const removeKnowledgeArticleMutation = useMutation({
    mutationFn: async (relationId: string) => {
      const { error } = await supabase
        .from('knowledge_article_templates')
        .delete()
        .eq('id', relationId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-article-templates', templateId],
      })
    },
    onError: () => {
      toast.error('Не удалось удалить статью')
    },
  })

  // Добавление групп базы знаний (доступ ко всей группе)
  const addKnowledgeGroupsMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      const inserts = groupIds.map((groupId) => ({
        project_template_id: templateId ?? '',
        group_id: groupId,
      }))

      const { error } = await supabase.from('knowledge_group_templates').insert(inserts)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-group-templates', templateId],
      })
      onKnowledgeGroupsAdded?.()
    },
    onError: () => {
      toast.error('Не удалось добавить группы')
    },
  })

  // Удаление группы базы знаний
  const removeKnowledgeGroupMutation = useMutation({
    mutationFn: async (relationId: string) => {
      const { error } = await supabase
        .from('knowledge_group_templates')
        .delete()
        .eq('id', relationId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-group-templates', templateId],
      })
    },
    onError: () => {
      toast.error('Не удалось удалить группу')
    },
  })

  // Добавление задачи
  const addTaskMutation = useMutation({
    mutationFn: async ({ name, sortOrder }: { name: string; sortOrder: number }) => {
      const { error } = await supabase.from('project_template_tasks').insert({
        project_template_id: templateId ?? '',
        name,
        sort_order: sortOrder,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-tasks', templateId] })
    },
    onError: () => {
      toast.error('Не удалось добавить задачу')
    },
  })

  // Обновление задачи
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      const { error } = await supabase
        .from('project_template_tasks')
        .update({ name })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-tasks', templateId] })
    },
    onError: () => {
      toast.error('Не удалось обновить задачу')
    },
  })

  // Удаление задачи
  const removeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('project_template_tasks').delete().eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-template-tasks', templateId] })
    },
    onError: () => {
      toast.error('Не удалось удалить задачу')
    },
  })

  return {
    updateTemplateMutation,
    updateModulesMutation,
    addFormsMutation,
    removeFormMutation,
    addDocKitsMutation,
    removeDocKitMutation,
    addKnowledgeArticlesMutation,
    removeKnowledgeArticleMutation,
    addKnowledgeGroupsMutation,
    removeKnowledgeGroupMutation,
    addTaskMutation,
    updateTaskMutation,
    removeTaskMutation,
  }
}
