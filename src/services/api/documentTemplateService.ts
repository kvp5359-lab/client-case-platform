import { supabase } from '@/lib/supabase'
import { safeFetchOrThrow, safeDeleteOrThrow, safeUpdateOrThrow } from '../supabase/queryHelpers'
import { DocumentTemplateError } from '../errors'
import { fileToBase64 } from '@/utils/fileConversion'
import { logger } from '@/utils/logger'

// =====================================================
// Типы
// =====================================================

export interface DocumentTemplatePlaceholder {
  name: string
  field_definition_id: string | null
  label?: string
}

/** Ответ Edge Function extract-placeholders: каждый плейсхолдер — строка или объект с name */
type ExtractPlaceholdersItem = string | { name: string }

interface ExtractPlaceholdersResult {
  placeholders: ExtractPlaceholdersItem[]
}

export interface DocumentTemplate {
  id: string
  name: string
  description: string | null
  file_path: string
  file_name: string
  file_size: number | null
  placeholders: DocumentTemplatePlaceholder[]
  form_template_id: string | null
  workspace_id: string
  created_by: string | null
  created_at: string
  updated_at: string
}

// =====================================================
// CRUD
// =====================================================

export async function getDocumentTemplates(workspaceId: string): Promise<DocumentTemplate[]> {
  const data = await safeFetchOrThrow<DocumentTemplate[] | null>(
    supabase
      .from('document_templates')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
    'Не удалось загрузить шаблоны документов',
    DocumentTemplateError,
  )
  return data ?? []
}

export async function getDocumentTemplateById(id: string): Promise<DocumentTemplate> {
  return safeFetchOrThrow<DocumentTemplate>(
    supabase.from('document_templates').select('*').eq('id', id).single(),
    'Не удалось загрузить шаблон документа',
    DocumentTemplateError,
  )
}

export async function uploadDocumentTemplate(params: {
  file: File
  name: string
  description?: string
  formTemplateId?: string
  workspaceId: string
}): Promise<DocumentTemplate> {
  const { file, name, description, formTemplateId, workspaceId } = params

  // 1. Upload file to Storage
  const fileName = `${crypto.randomUUID()}.docx`
  const filePath = `${workspaceId}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('document-templates')
    .upload(filePath, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

  if (uploadError) {
    throw new DocumentTemplateError('Не удалось загрузить файл шаблона', uploadError)
  }

  // 2. Extract placeholders via Edge Function
  const fileBase64 = await fileToBase64(file)
  const { data: extractResult, error: extractError } =
    await supabase.functions.invoke<ExtractPlaceholdersResult>('extract-placeholders', {
      body: { file_base64: fileBase64, workspace_id: workspaceId },
    })

  if (extractError) {
    await supabase.storage.from('document-templates').remove([filePath])
    throw new DocumentTemplateError('Не удалось извлечь плейсхолдеры', extractError)
  }

  const placeholders = extractResult?.placeholders ?? []

  // 3. Create DB record
  try {
    return await safeFetchOrThrow<DocumentTemplate>(
      supabase
        .from('document_templates')
        .insert({
          name,
          description: description || null,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          placeholders,
          form_template_id: formTemplateId || null,
          workspace_id: workspaceId,
        })
        .select()
        .single(),
      'Не удалось создать шаблон документа',
      DocumentTemplateError,
    )
  } catch (error) {
    await supabase.storage.from('document-templates').remove([filePath])
    throw error
  }
}

export async function updateDocumentTemplate(
  id: string,
  updates: {
    name?: string
    description?: string | null
    placeholders?: DocumentTemplatePlaceholder[]
    form_template_id?: string | null
  },
): Promise<void> {
  await safeUpdateOrThrow(
    supabase.from('document_templates').update(updates).eq('id', id).select().single(),
    'Не удалось обновить шаблон документа',
    DocumentTemplateError,
  )
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  const template = await getDocumentTemplateById(id)

  await safeDeleteOrThrow(
    supabase.from('document_templates').delete().eq('id', id),
    'Не удалось удалить шаблон документа',
    DocumentTemplateError,
  )

  // Z6-04: логируем ошибку Storage-удаления (orphaned файл лучше чем потеря записи)
  const { error: storageError } = await supabase.storage
    .from('document-templates')
    .remove([template.file_path])
  if (storageError) {
    logger.error('Failed to delete template file from storage:', storageError)
  }
}

// =====================================================
// Замена файла шаблона
// =====================================================

export async function replaceDocumentTemplateFile(params: {
  templateId: string
  file: File
  workspaceId: string
}): Promise<DocumentTemplate> {
  const { templateId, file, workspaceId } = params

  // 1. Получить текущий шаблон (для удаления старого файла)
  const existing = await getDocumentTemplateById(templateId)

  // 2. Загрузить новый файл в Storage
  const fileName = `${crypto.randomUUID()}.docx`
  const filePath = `${workspaceId}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('document-templates')
    .upload(filePath, file, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

  if (uploadError) {
    throw new DocumentTemplateError('Не удалось загрузить файл шаблона', uploadError)
  }

  // 3. Извлечь плейсхолдеры из нового файла
  const fileBase64 = await fileToBase64(file)
  const { data: extractResult, error: extractError } =
    await supabase.functions.invoke<ExtractPlaceholdersResult>('extract-placeholders', {
      body: { file_base64: fileBase64, workspace_id: workspaceId },
    })

  if (extractError) {
    await supabase.storage.from('document-templates').remove([filePath])
    throw new DocumentTemplateError('Не удалось извлечь плейсхолдеры', extractError)
  }

  const newPlaceholderNames = extractResult?.placeholders ?? []

  // 4. Сохранить маппинг из старых плейсхолдеров (для плейсхолдеров которые остались)
  const oldPlaceholders = (existing.placeholders || []) as DocumentTemplatePlaceholder[]
  const oldMapping = new Map(oldPlaceholders.map((p) => [p.name, p]))

  const mergedPlaceholders: DocumentTemplatePlaceholder[] = newPlaceholderNames.map((p) => {
    const nameStr = typeof p === 'string' ? p : p.name
    const old = oldMapping.get(nameStr)
    return old ? { ...old } : { name: nameStr, field_definition_id: null }
  })

  // 5. Обновить запись в БД
  try {
    const updated = await safeFetchOrThrow<DocumentTemplate>(
      supabase
        .from('document_templates')
        .update({
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          placeholders: mergedPlaceholders,
          updated_at: new Date().toISOString(),
        })
        .eq('id', templateId)
        .select()
        .single(),
      'Не удалось обновить шаблон документа',
      DocumentTemplateError,
    )

    // 6. Удалить старый файл из Storage
    const { error: removeError } = await supabase.storage
      .from('document-templates')
      .remove([existing.file_path])
    if (removeError) {
      logger.error('Failed to delete old template file from storage:', removeError)
    }

    return updated
  } catch (error) {
    // Откат: удаляем новый файл если не удалось обновить запись
    await supabase.storage.from('document-templates').remove([filePath])
    throw error
  }
}

// =====================================================
// Генерация документа
// =====================================================

export async function generateDocument(params: {
  documentTemplateId: string
  projectId: string
  workspaceId: string
}): Promise<{ fileBase64: string; fileName: string }> {
  const { data, error } = await supabase.functions.invoke('generate-document', {
    body: {
      document_template_id: params.documentTemplateId,
      project_id: params.projectId,
      workspace_id: params.workspaceId,
    },
  })

  if (error || !data?.success) {
    throw new DocumentTemplateError(data?.error || 'Не удалось сгенерировать документ', error)
  }

  return {
    fileBase64: data.file_base64,
    fileName: data.file_name,
  }
}

// =====================================================
// Утилиты
// =====================================================
