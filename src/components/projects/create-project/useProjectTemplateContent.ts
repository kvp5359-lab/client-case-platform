"use client"

/**
 * Загрузка контента шаблона проекта (наборы документов, анкеты, шаблоны тредов,
 * структурные блоки плана) для выбранного project_template. Общий источник для
 * CreateProjectDialog (создание проекта) и AddFromTemplateDialog (добавление в
 * существующий проект) — чтобы не дублировать 4 запроса + нормализацию.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { projectTemplateKeys } from '@/hooks/queryKeys'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'

export type SimpleTemplate = { id: string; name: string }

export function useProjectTemplateContent(
  activeTemplateId: string | undefined,
  workspaceId: string | undefined,
  enabled = true,
) {
  const { data: linkedDocKits = [] } = useQuery({
    queryKey: projectTemplateKeys.documentKits(activeTemplateId),
    queryFn: async () => {
      if (!activeTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_document_kits')
        .select('*, document_kit_template:document_kit_templates(id, name)')
        .eq('project_template_id', activeTemplateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!activeTemplateId && enabled,
  })

  const { data: scopedThreadTemplates = [] } = useThreadTemplatesByProjectTemplate(activeTemplateId)

  const { data: linkedForms = [] } = useQuery({
    queryKey: projectTemplateKeys.forms(activeTemplateId),
    queryFn: async () => {
      if (!activeTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_forms')
        .select('*, form_template:form_templates(id, name)')
        .eq('project_template_id', activeTemplateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!activeTemplateId && enabled,
  })

  const { blocks: templatePlanBlocks } = useTemplatePlan(activeTemplateId, workspaceId)
  const planContentBlocks = useMemo(
    () => templatePlanBlocks.filter((b) => b.block_type === 'heading' || b.block_type === 'text'),
    [templatePlanBlocks],
  )

  const docKitTemplates = useMemo(
    () =>
      linkedDocKits
        .map((item) => {
          const tpl = Array.isArray(item.document_kit_template)
            ? item.document_kit_template[0]
            : item.document_kit_template
          return tpl as SimpleTemplate | null
        })
        .filter((t): t is SimpleTemplate => t !== null),
    [linkedDocKits],
  )

  const formTemplates = useMemo(
    () =>
      linkedForms
        .map((item) => {
          const tpl = Array.isArray(item.form_template) ? item.form_template[0] : item.form_template
          return tpl as SimpleTemplate | null
        })
        .filter((t): t is SimpleTemplate => t !== null),
    [linkedForms],
  )

  return { docKitTemplates, formTemplates, scopedThreadTemplates, planContentBlocks }
}
