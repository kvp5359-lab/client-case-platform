/**
 * Хуки для загрузки данных редактора типа проекта
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  projectTemplateKeys,
  formTemplateKeys,
  documentKitTemplateKeys,
} from '@/hooks/queryKeys'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'

interface UseProjectTemplateDataParams {
  workspaceId: string | undefined
  templateId: string | undefined
}

/**
 * Загрузка типа проекта
 */
export function useProjectTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.detail(templateId),
    queryFn: async () => {
      if (!templateId) return null

      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!templateId,
  })
}

/**
 * Загрузка связанных шаблонов анкет
 */
export function useLinkedForms(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.forms(templateId),
    queryFn: async () => {
      if (!templateId) return []

      const { data, error } = await supabase
        .from('project_template_forms')
        .select(
          `
          *,
          form_template:form_templates(*)
        `,
        )
        .eq('project_template_id', templateId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return (data || []) as FormTemplateWithRelation[]
    },
    enabled: !!templateId,
  })
}

/**
 * Загрузка связанных шаблонов наборов документов
 */
export function useLinkedDocKits(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.documentKits(templateId),
    queryFn: async () => {
      if (!templateId) return []

      const { data, error } = await supabase
        .from('project_template_document_kits')
        .select(
          `
          *,
          document_kit_template:document_kit_templates(*)
        `,
        )
        .eq('project_template_id', templateId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return (data || []) as DocumentKitTemplateWithRelation[]
    },
    enabled: !!templateId,
  })
}

/**
 * Загрузка привязанных статей базы знаний (точечные)
 */
export function useLinkedKnowledgeArticles(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.knowledgeArticles(templateId),
    queryFn: async () => {
      if (!templateId) return []

      const { data, error } = await supabase
        .from('knowledge_article_templates')
        .select(
          `
          *,
          knowledge_article:knowledge_articles(*)
        `,
        )
        .eq('project_template_id', templateId)

      if (error) throw error
      return (data || []) as KnowledgeArticleWithRelation[]
    },
    enabled: !!templateId,
  })
}

/**
 * Загрузка привязанных групп базы знаний
 */
export function useLinkedKnowledgeGroups(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.knowledgeGroups(templateId),
    queryFn: async () => {
      if (!templateId) return []

      const { data, error } = await supabase
        .from('knowledge_group_templates')
        .select(
          `
          *,
          knowledge_group:knowledge_groups(*)
        `,
        )
        .eq('project_template_id', templateId)

      if (error) throw error
      return (data || []) as KnowledgeGroupWithRelation[]
    },
    enabled: !!templateId,
  })
}

/**
 * Загрузка всех доступных статей базы знаний
 */
export function useAvailableKnowledgeArticles(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['knowledge-articles', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('title', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })
}

/**
 * Загрузка всех доступных групп базы знаний
 */
export function useAvailableKnowledgeGroups(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['knowledge-groups', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })
}

/**
 * Загрузка всех доступных шаблонов анкет
 */
export function useAvailableForms(workspaceId: string | undefined) {
  return useQuery({
    queryKey: formTemplateKeys.listByWorkspace(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })
}

/**
 * Загрузка всех доступных шаблонов наборов документов
 */
export function useAvailableDocKits(workspaceId: string | undefined) {
  return useQuery({
    queryKey: documentKitTemplateKeys.listByWorkspace(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('document_kit_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId,
  })
}

/**
 * Загрузка шаблонных задач
 */
export function useLinkedTemplateTasks(templateId: string | undefined) {
  return useQuery({
    queryKey: projectTemplateKeys.tasks(templateId),
    queryFn: async () => {
      if (!templateId) return []

      const { data, error } = await supabase
        .from('project_template_tasks')
        .select('*')
        .eq('project_template_id', templateId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!templateId,
  })
}

/**
 * Комбинированный хук для всех данных редактора
 */
export function useProjectTemplateData({ workspaceId, templateId }: UseProjectTemplateDataParams) {
  const templateQuery = useProjectTemplate(templateId)
  const linkedFormsQuery = useLinkedForms(templateId)
  const linkedDocKitsQuery = useLinkedDocKits(templateId)
  const linkedKnowledgeArticlesQuery = useLinkedKnowledgeArticles(templateId)
  const linkedKnowledgeGroupsQuery = useLinkedKnowledgeGroups(templateId)
  const linkedTasksQuery = useLinkedTemplateTasks(templateId)
  const availableFormsQuery = useAvailableForms(workspaceId)
  const availableDocKitsQuery = useAvailableDocKits(workspaceId)
  const availableKnowledgeArticlesQuery = useAvailableKnowledgeArticles(workspaceId)
  const availableKnowledgeGroupsQuery = useAvailableKnowledgeGroups(workspaceId)

  const isLoading =
    templateQuery.isLoading || linkedFormsQuery.isLoading || linkedDocKitsQuery.isLoading

  // Фильтрация доступных шаблонов (исключаем уже добавленные)
  const linkedFormIds = (linkedFormsQuery.data || []).map((f) => f.form_template_id)
  const availableFormsFiltered = (availableFormsQuery.data || []).filter(
    (f) => !linkedFormIds.includes(f.id),
  )

  const linkedDocKitIds = (linkedDocKitsQuery.data || []).map((d) => d.document_kit_template_id)
  const availableDocKitsFiltered = (availableDocKitsQuery.data || []).filter(
    (d) => !linkedDocKitIds.includes(d.id),
  )

  const linkedKnowledgeArticleIds = (linkedKnowledgeArticlesQuery.data || []).map(
    (a) => a.article_id,
  )
  const availableKnowledgeArticlesFiltered = (availableKnowledgeArticlesQuery.data || []).filter(
    (a) => !linkedKnowledgeArticleIds.includes(a.id),
  )

  const linkedKnowledgeGroupIds = (linkedKnowledgeGroupsQuery.data || []).map((g) => g.group_id)
  const availableKnowledgeGroupsFiltered = (availableKnowledgeGroupsQuery.data || []).filter(
    (g) => !linkedKnowledgeGroupIds.includes(g.id),
  )

  return {
    template: templateQuery.data,
    linkedForms: linkedFormsQuery.data || [],
    linkedDocKits: linkedDocKitsQuery.data || [],
    linkedKnowledgeArticles: linkedKnowledgeArticlesQuery.data || [],
    linkedKnowledgeGroups: linkedKnowledgeGroupsQuery.data || [],
    linkedTasks: linkedTasksQuery.data || [],
    availableFormsFiltered,
    availableDocKitsFiltered,
    availableKnowledgeArticlesFiltered,
    availableKnowledgeGroupsFiltered,
    isLoading,
  }
}
