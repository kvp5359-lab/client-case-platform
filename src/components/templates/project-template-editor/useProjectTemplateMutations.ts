/**
 * Мутации для редактора типа проекта
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { projectTemplateKeys, sidebarMetaKeys } from '@/hooks/queryKeys'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'
import type { DefaultPanelTabItem } from './panelTabsTypes'

type UseProjectTemplateMutationsParams = {
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
  linkedKnowledgeArticles: _linkedKnowledgeArticles,
  linkedKnowledgeGroups: _linkedKnowledgeGroups,
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
      onNameSaved?.()
    },
    onError: () => {
      toast.error('Не удалось обновить шаблон')
    },
  })

  // Хелпер: общая инвалидация для всего, что связано с иконкой/цветом шаблона.
  const invalidateIconAndColor = () => {
    queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
    queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detailFull(templateId) })
    // Сайдбар держит мапу иконок и цветов шаблонов в отдельном ключе.
    queryClient.invalidateQueries({ queryKey: sidebarMetaKeys.templatesIconsAll })
  }

  // Обновление иконки шаблона
  const updateIconMutation = useMutation({
    mutationFn: async (icon: string) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ icon })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: invalidateIconAndColor,
    onError: () => {
      toast.error('Не удалось обновить иконку')
    },
  })

  // Режим окраски иконки: 'status' (цвет статуса) | 'fixed' (свой цвет)
  const updateIconColorModeMutation = useMutation({
    mutationFn: async (mode: 'status' | 'fixed') => {
      const { error } = await supabase
        .from('project_templates')
        .update({ icon_color_mode: mode })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: invalidateIconAndColor,
    onError: () => {
      toast.error('Не удалось обновить режим цвета')
    },
  })

  // Фиксированный цвет иконки (используется в режиме 'fixed')
  const updateIconColorMutation = useMutation({
    mutationFn: async (color: string) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ icon_color: color })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: invalidateIconAndColor,
    onError: () => {
      toast.error('Не удалось обновить цвет иконки')
    },
  })

  // Переключение флага "это шаблон лида" (CRM-фрейм этап 3)
  const updateIsLeadTemplateMutation = useMutation({
    mutationFn: async (isLead: boolean) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ is_lead_template: isLead })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
    },
    onError: () => {
      toast.error('Не удалось обновить флаг лида')
    },
  })

  // Обновление дефолтных вкладок боковой панели
  const updateDefaultPanelTabsMutation = useMutation({
    mutationFn: async (items: DefaultPanelTabItem[]) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ default_panel_tabs: items })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
    },
    onError: () => {
      toast.error('Не удалось сохранить настройки боковой панели')
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.forms(templateId) })
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.forms(templateId) })
    },
    onError: () => {
      toast.error('Не удалось удалить анкету')
    },
  })

  // Переупорядочивание анкет (drag & drop). order_index обновляется батчем
  // параллельных UPDATE по id связи — supabase-js не умеет bulk update.
  // Оптимистик как у задач: переставляем порядок прямо в кэше React Query
  // (onMutate), при ошибке откатываемся к снапшоту.
  const reorderFormsMutation = useMutation({
    mutationFn: async (orderedRelationIds: string[]) => {
      const results = await Promise.all(
        orderedRelationIds.map((id, i) =>
          supabase.from('project_template_forms').update({ order_index: i }).eq('id', id),
        ),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
    },
    onMutate: async (orderedRelationIds: string[]) => {
      const key = projectTemplateKeys.forms(templateId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FormTemplateWithRelation[]>(key)
      if (previous) {
        const byId = new Map(previous.map((r) => [r.id, r]))
        const reordered = orderedRelationIds
          .map((id, i) => {
            const row = byId.get(id)
            return row ? { ...row, order_index: i } : null
          })
          .filter((r): r is FormTemplateWithRelation => r !== null)
        queryClient.setQueryData<FormTemplateWithRelation[]>(key, reordered)
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      toast.error('Не удалось сохранить порядок анкет')
      if (context?.previous) {
        queryClient.setQueryData(projectTemplateKeys.forms(templateId), context.previous)
      }
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.documentKits(templateId) })
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
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.documentKits(templateId) })
    },
    onError: () => {
      toast.error('Не удалось удалить набор документов')
    },
  })

  // Переупорядочивание наборов документов (drag & drop). Оптимистик в кэше.
  const reorderDocKitsMutation = useMutation({
    mutationFn: async (orderedRelationIds: string[]) => {
      const results = await Promise.all(
        orderedRelationIds.map((id, i) =>
          supabase
            .from('project_template_document_kits')
            .update({ order_index: i })
            .eq('id', id),
        ),
      )
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
    },
    onMutate: async (orderedRelationIds: string[]) => {
      const key = projectTemplateKeys.documentKits(templateId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<DocumentKitTemplateWithRelation[]>(key)
      if (previous) {
        const byId = new Map(previous.map((r) => [r.id, r]))
        const reordered = orderedRelationIds
          .map((id, i) => {
            const row = byId.get(id)
            return row ? { ...row, order_index: i } : null
          })
          .filter((r): r is DocumentKitTemplateWithRelation => r !== null)
        queryClient.setQueryData<DocumentKitTemplateWithRelation[]>(key, reordered)
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      toast.error('Не удалось сохранить порядок документов')
      if (context?.previous) {
        queryClient.setQueryData(projectTemplateKeys.documentKits(templateId), context.previous)
      }
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
        queryKey: projectTemplateKeys.knowledgeArticles(templateId),
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
        queryKey: projectTemplateKeys.knowledgeArticles(templateId),
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
        queryKey: projectTemplateKeys.knowledgeGroups(templateId),
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
        queryKey: projectTemplateKeys.knowledgeGroups(templateId),
      })
    },
    onError: () => {
      toast.error('Не удалось удалить группу')
    },
  })

  return {
    updateTemplateMutation,
    updateIconMutation,
    updateIconColorModeMutation,
    updateIconColorMutation,
    updateIsLeadTemplateMutation,
    updateModulesMutation,
    updateDefaultPanelTabsMutation,
    addFormsMutation,
    removeFormMutation,
    reorderFormsMutation,
    addDocKitsMutation,
    removeDocKitMutation,
    reorderDocKitsMutation,
    addKnowledgeArticlesMutation,
    removeKnowledgeArticleMutation,
    addKnowledgeGroupsMutation,
    removeKnowledgeGroupMutation,
  }
}
