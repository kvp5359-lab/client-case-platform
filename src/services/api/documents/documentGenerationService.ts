import { supabase } from '@/lib/supabase'
import {
  safeFetchOrThrow,
  safeDeleteOrThrow,
  safeUpdateVoidOrThrow,
} from '../../supabase/queryHelpers'
import { DocumentGenerationError } from '../../errors'
import type { DocumentTemplatePlaceholder } from './documentTemplateService'
import { base64ToBlob } from '@/utils/files/fileConversion'
import { downloadBlob } from '@/utils/files/downloadBlob'

// =====================================================
// Типы
// =====================================================

export type DocumentGeneration = {
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

  // Для полей-справочников (directory_ref) значение в form_kit_field_values —
  // это UUID записи справочника. Резолвим его в читаемое значение:
  // либо название записи (display_name), либо выбранную колонку.
  const dirRefByField = await resolveDirectoryRefFields(mappedFieldIds)
  const dirValueByPlaceholder = await resolveDirectoryValues(
    placeholders,
    fieldValueMap,
    dirRefByField,
  )

  // Маппинг: placeholder name → value
  const result: Record<string, string> = {}
  for (const ph of placeholders) {
    if (!ph.field_definition_id) continue
    if (dirRefByField[ph.field_definition_id]) {
      // directory_ref: используем резолвленное значение (может быть пустым)
      if (ph.name in dirValueByPlaceholder) {
        result[ph.name] = dirValueByPlaceholder[ph.name]
      }
    } else if (fieldValueMap[ph.field_definition_id]) {
      result[ph.name] = fieldValueMap[ph.field_definition_id]
    }
  }

  return result
}

/** Возвращает { field_definition_id → ref_directory_id } только для directory_ref полей. */
async function resolveDirectoryRefFields(
  fieldIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (fieldIds.length === 0) return out

  const { data, error } = await supabase
    .from('field_definitions')
    .select('id, field_type, options')
    .in('id', fieldIds)
  if (error) throw new DocumentGenerationError(error.message)

  for (const fd of data || []) {
    if (fd.field_type === 'directory_ref') {
      const refId = (fd.options as { ref_directory_id?: string } | null)?.ref_directory_id
      if (refId) out[fd.id] = refId
    }
  }
  return out
}

/**
 * Резолвит directory_ref-плейсхолдеры: UUID записи → читаемое значение.
 * Возвращает { placeholder name → value } только для directory_ref привязок.
 */
async function resolveDirectoryValues(
  placeholders: DocumentTemplatePlaceholder[],
  fieldValueMap: Record<string, string>,
  dirRefByField: Record<string, string>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  const entryIdsForDisplay = new Set<string>()
  const columnLookups: { entryId: string; fieldId: string }[] = []

  for (const ph of placeholders) {
    const fid = ph.field_definition_id
    if (!fid || !dirRefByField[fid]) continue
    const entryId = fieldValueMap[fid]
    if (!entryId) continue
    if (ph.directory_field_id) {
      columnLookups.push({ entryId, fieldId: ph.directory_field_id })
    } else {
      entryIdsForDisplay.add(entryId)
    }
  }

  const displayName: Record<string, string> = {}
  if (entryIdsForDisplay.size > 0) {
    const { data } = await supabase
      .from('custom_directory_entries')
      .select('id, display_name')
      .in('id', Array.from(entryIdsForDisplay))
    for (const e of data || []) displayName[e.id] = e.display_name ?? ''
  }

  const columnValue: Record<string, string> = {}
  if (columnLookups.length > 0) {
    const entryIds = Array.from(new Set(columnLookups.map((c) => c.entryId)))
    const fieldIds = Array.from(new Set(columnLookups.map((c) => c.fieldId)))
    const { data } = await supabase
      .from('custom_directory_values')
      .select('entry_id, field_id, value_text, value_number, value_date, value_bool, value_json')
      .in('entry_id', entryIds)
      .in('field_id', fieldIds)
    for (const v of data || []) {
      const raw =
        v.value_text ??
        (v.value_number != null ? String(v.value_number) : null) ??
        v.value_date ??
        (v.value_bool != null ? (v.value_bool ? 'Да' : 'Нет') : null) ??
        (v.value_json != null
          ? Array.isArray(v.value_json)
            ? v.value_json.join(', ')
            : String(v.value_json).replace(/^"|"$/g, '')
          : null)
      if (raw != null) columnValue[`${v.entry_id}:${v.field_id}`] = String(raw)
    }
  }

  for (const ph of placeholders) {
    const fid = ph.field_definition_id
    if (!fid || !dirRefByField[fid]) continue
    const entryId = fieldValueMap[fid]
    if (!entryId) {
      result[ph.name] = ''
      continue
    }
    result[ph.name] = ph.directory_field_id
      ? (columnValue[`${entryId}:${ph.directory_field_id}`] ?? '')
      : (displayName[entryId] ?? '')
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

// base64ToFile — реэкспорт из @/utils/files/fileConversion
export { base64ToFile } from '@/utils/files/fileConversion'
