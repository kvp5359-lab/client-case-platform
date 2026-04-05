import { supabase } from '@/lib/supabase'
import {
  safeFetchOrThrow,
  safeDeleteOrThrow,
  safeUpdateVoidOrThrow,
} from '../supabase/queryHelpers'
import { DocumentGenerationError } from '../errors'
import type { DocumentTemplatePlaceholder } from './documentTemplateService'
import { base64ToBlob } from '@/utils/fileConversion'
import { downloadBlob } from '@/utils/downloadBlob'

// =====================================================
// Типы
// =====================================================

export interface DocumentGeneration {
  id: string
  project_id: string
  workspace_id: string
  document_template_id: string
  name: string
  placeholder_values: Record<string, string>
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

// =====================================================
// CRUD
// =====================================================

export async function getDocumentGenerations(projectId: string): Promise<DocumentGeneration[]> {
  const { data, error } = await supabase
    .from('document_generations')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new DocumentGenerationError('Не удалось загрузить блоки генерации', error)
  return (data ?? []) as unknown as DocumentGeneration[]
}

export async function createDocumentGeneration(params: {
  projectId: string
  workspaceId: string
  documentTemplateId: string
  name: string
}): Promise<DocumentGeneration> {
  return safeFetchOrThrow<DocumentGeneration>(
    supabase
      .from('document_generations')
      .insert({
        project_id: params.projectId,
        workspace_id: params.workspaceId,
        document_template_id: params.documentTemplateId,
        name: params.name,
      })
      .select()
      .single(),
    'Не удалось создать блок генерации',
    DocumentGenerationError,
  )
}

export async function updateDocumentGeneration(
  id: string,
  updates: {
    name?: string
    placeholder_values?: Record<string, string>
  },
): Promise<void> {
  await safeUpdateVoidOrThrow(
    supabase.from('document_generations').update(updates).eq('id', id),
    'Не удалось обновить блок генерации',
    DocumentGenerationError,
  )
}

export async function deleteDocumentGeneration(id: string): Promise<void> {
  await safeDeleteOrThrow(
    supabase.from('document_generations').delete().eq('id', id),
    'Не удалось удалить блок генерации',
    DocumentGenerationError,
  )
}

// =====================================================
// Заполнение из анкеты
// =====================================================

export async function fillPlaceholdersFromFormKit(params: {
  projectId: string
  placeholders: DocumentTemplatePlaceholder[]
}): Promise<Record<string, string>> {
  const { projectId, placeholders } = params

  const mappedFieldIds = placeholders.map((p) => p.field_definition_id).filter(Boolean) as string[]

  if (mappedFieldIds.length === 0) return {}

  // Загрузить form_kits проекта
  const { data: formKits, error: formKitsError } = await supabase
    .from('form_kits')
    .select('id')
    .eq('project_id', projectId)
  if (formKitsError) throw new DocumentGenerationError(formKitsError.message)

  const fkIds = (formKits || []).map((fk: { id: string }) => fk.id)
  if (fkIds.length === 0) return {}

  // Загрузить значения полей
  const { data: values, error: valuesError } = await supabase
    .from('form_kit_field_values')
    .select('field_definition_id, value, updated_at')
    .in('form_kit_id', fkIds)
    .in('field_definition_id', mappedFieldIds)
    .order('updated_at', { ascending: false })
  if (valuesError) throw new DocumentGenerationError(valuesError.message)

  // Агрегация: самое свежее значение побеждает
  const fieldValueMap: Record<string, string> = {}
  const seen = new Set<string>()
  for (const v of values || []) {
    if (!seen.has(v.field_definition_id) && v.value) {
      seen.add(v.field_definition_id)
      // Попробовать распарсить JSON-значения
      let parsed = v.value
      try {
        const json = JSON.parse(v.value)
        if (typeof json === 'string') parsed = json
        else if (Array.isArray(json)) parsed = json.join(', ')
        else if (typeof json === 'object' && json !== null) parsed = JSON.stringify(json)
      } catch {
        // Не JSON, используем как есть
      }
      fieldValueMap[v.field_definition_id] = parsed
    }
  }

  // Маппинг: placeholder name → value
  const result: Record<string, string> = {}
  for (const ph of placeholders) {
    if (ph.field_definition_id && fieldValueMap[ph.field_definition_id]) {
      result[ph.name] = fieldValueMap[ph.field_definition_id]
    }
  }

  return result
}

// =====================================================
// Генерация документа
// =====================================================

export async function generateDocumentWithValues(params: {
  documentTemplateId: string
  projectId: string
  workspaceId: string
  customValues: Record<string, string>
  convertToPdf?: boolean
}): Promise<{ fileBase64: string; fileName: string; mimeType: string }> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    error?: string
    file_base64: string
    file_name: string
    mime_type: string
  }>('generate-document', {
    body: {
      document_template_id: params.documentTemplateId,
      project_id: params.projectId,
      workspace_id: params.workspaceId,
      custom_values: params.customValues,
      convert_to_pdf: params.convertToPdf ?? true,
    },
  })

  if (error || !data?.success) {
    throw new DocumentGenerationError(data?.error || 'Не удалось сгенерировать документ', error)
  }

  return {
    fileBase64: data.file_base64,
    fileName: data.file_name,
    mimeType: data.mime_type,
  }
}

/**
 * Скачивание сгенерированного документа из base64.
 */
export function downloadGeneratedFile(
  base64: string,
  fileName: string,
  mimeType = 'application/pdf',
): void {
  const blob = base64ToBlob(base64, mimeType)
  downloadBlob(blob, fileName)
}

// base64ToFile — реэкспорт из @/utils/fileConversion
export { base64ToFile } from '@/utils/fileConversion'
