"use client"

/**
 * Хук для генерации сводки по анкете
 *
 * Аналог useDocumentSummary, но для анкет.
 * Загружает секции, данные, прогресс, комментарии и формирует текстовую сводку.
 */

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCommentsByEntity } from '@/services/api/commentService'
import { getSectionProgress } from '@/hooks/useFormKitProgress'
import type { FormSectionWithFields, CompositeFieldItem, FormData } from '@/components/forms/types'

interface UseFormSummaryParams {
  workspaceId: string
}

export function useFormSummary({ workspaceId }: UseFormSummaryParams) {
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const generateSummary = useCallback(
    async (formKitId: string, formKitName: string) => {
      setSummaryLoading(true)
      setSummaryDialogOpen(true)
      setSummaryText('')
      setCopied(false)

      try {
        // Загружаем секции с полями
        const { data: sectionsRaw, error: sectionsError } = await supabase
          .from('form_kit_sections')
          .select(`*, status_data:statuses(*), form_kit_fields(*)`)
          .eq('form_kit_id', formKitId)
          .order('sort_order', { ascending: true })
          .order('sort_order', { ascending: true, referencedTable: 'form_kit_fields' })

        if (sectionsError) throw sectionsError

        // Загружаем данные анкеты
        const { data: formDataRaw } = await supabase
          .from('form_kit_field_values')
          .select('field_definition_id, value')
          .eq('form_kit_id', formKitId)

        const formData: FormData = {}
        for (const row of formDataRaw || []) {
          if (row.field_definition_id && row.value) {
            formData[row.field_definition_id] = row.value
          }
        }

        // Загружаем composite items — нужны field_definition_id всех полей секций
        const allFieldDefinitionIds = (sectionsRaw || [])
          .flatMap((s) =>
            ((s.form_kit_fields as Record<string, unknown>[] | null) || []).map(
              (f) => f.field_definition_id as string,
            ),
          )
          .filter(Boolean)

        const { data: compositeRaw } = await supabase
          .from('field_definition_composite_items')
          .select('*, nested_field:field_definitions!nested_field_id(*)')
          .in(
            'composite_field_id',
            allFieldDefinitionIds.length > 0 ? allFieldDefinitionIds : ['__none__'],
          )
          .order('order_index', { ascending: true })

        const compositeItems = (compositeRaw || []).map((ci) => ({
          id: ci.id,
          composite_field_id: ci.composite_field_id,
          nested_field_id: ci.nested_field_id,
          order_index: ci.order_index,
          nested_field: ci.nested_field,
        })) as unknown as CompositeFieldItem[]

        // Маппинг секций
        const sections = (sectionsRaw || []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          sort_order: s.sort_order,
          status_data: s.status_data,
          fields: (s.form_kit_fields || []).map((f: Record<string, unknown>) => ({
            id: f.id as string,
            field_definition_id: f.field_definition_id as string,
            name: f.name as string,
            field_type: f.field_type as string,
            description: f.description as string | null,
            options: f.options,
            placeholder: f.placeholder as string | null,
            help_text: f.help_text as string | null,
            validation: f.validation,
            is_required: f.is_required as boolean,
            sort_order: f.sort_order as number,
          })),
        }))

        // Загружаем комментарии для всех секций
        const commentPromises = sections.map((s) =>
          getCommentsByEntity('form_section', s.id, workspaceId).catch(() => []),
        )
        const commentsPerSection = await Promise.all(commentPromises)

        // Формируем текст
        const lines: string[] = [`По анкете "${formKitName}":`]

        sections.forEach((section, idx) => {
          const progress = getSectionProgress(section as unknown as FormSectionWithFields, formData, compositeItems)
          const statusData = section.status_data as {
            is_final?: boolean
            color?: string
            name?: string
          } | null
          const statusIcon = statusData?.is_final
            ? '✅'
            : statusData?.color === '#ef4444' || statusData?.name?.toLowerCase().includes('отклон')
              ? '❌'
              : progress.isComplete
                ? '🔵'
                : progress.filled > 0
                  ? '🟡'
                  : '⬜'

          lines.push(
            `${statusIcon} ${idx + 1}. **${section.name}** — ${progress.filled}/${progress.total}`,
          )

          // Незаполненные обязательные поля
          for (const field of section.fields) {
            if (!field.is_required) continue
            const defId = field.field_definition_id
            if (!defId) continue
            const value = formData[defId] || ''
            if (value.trim() === '') {
              lines.push(`  ⚠️ Не заполнено: ${field.name}`)
            }
          }

          // Незавершённые комментарии
          const sectionComments = commentsPerSection[idx] || []
          const unresolvedThreads = sectionComments.filter((t) => !t.root.is_resolved)
          for (const thread of unresolvedThreads) {
            const allMessages = [thread.root, ...thread.replies]
            for (const msg of allMessages) {
              lines.push(`> ${msg.content}`)
            }
          }

          lines.push('')
        })

        setSummaryText(lines.join('\n').trim())
      } catch {
        setSummaryText('Ошибка при формировании сводки')
      } finally {
        setSummaryLoading(false)
      }
    },
    [workspaceId],
  )

  const handleCopySummary = useCallback(() => {
    navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [summaryText])

  return {
    summaryDialogOpen,
    setSummaryDialogOpen,
    summaryText,
    summaryLoading,
    copied,
    generateSummary,
    handleCopySummary,
  }
}
