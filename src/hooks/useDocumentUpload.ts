"use client"

/**
 * Мутация загрузки файла — создание документа + upload в Storage
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { TablesInsert } from '@/types/database'
import { documentKitKeys, kitlessDocumentKeys } from '@/hooks/queryKeys'
import { triggerTextExtraction } from '@/services/documents/textExtractionService'

export interface UploadDocumentParams {
  file: File
  documentKitId: string | null
  projectId: string
  workspaceId: string
  documentName?: string
  documentDescription?: string
  folderId?: string | null
  sourceDocumentId?: string | null
  skipInvalidation?: boolean
}

export function useDocumentUpload(projectId?: string) {
  const queryClient = useQueryClient()

  const invalidateCache = (overrideProjectId?: string) => {
    const pid = overrideProjectId || projectId
    if (pid) {
      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(pid) })
      queryClient.invalidateQueries({ queryKey: kitlessDocumentKeys.byProject(pid) })
    } else {
      queryClient.invalidateQueries({ queryKey: documentKitKeys.all })
      queryClient.invalidateQueries({ queryKey: kitlessDocumentKeys.all })
    }
  }

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({
      file,
      documentKitId,
      projectId: mutationProjectId,
      workspaceId,
      documentName,
      documentDescription,
      folderId,
      sourceDocumentId,
    }: UploadDocumentParams) => {
      // 1. Проверяем размер файла
      const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 МБ
      if (file.size === 0) {
        throw new Error(
          `Файл "${file.name}" имеет размер 0 байт. Убедитесь, что файл не повреждён и попробуйте снова.`,
        )
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          `Файл "${file.name}" слишком большой (${Math.round(file.size / 1024 / 1024)} МБ). Максимальный размер: 100 МБ.`,
        )
      }

      // 2. Вычисляем sort_order — новый документ добавляется в конец папки
      let sortOrder = 0
      if (folderId) {
        const { data: maxRow } = await supabase
          .from('documents')
          .select('sort_order')
          .eq('folder_id', folderId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (maxRow) {
          sortOrder = (maxRow.sort_order || 0) + 1
        }
      }

      // 3. Создаём документ в БД (пока без файла)
      const docData: TablesInsert<'documents'> = {
        document_kit_id: documentKitId,
        project_id: mutationProjectId,
        workspace_id: workspaceId,
        name: documentName || file.name,
        description: documentDescription,
        folder_id: folderId || null,
        status: 'pending',
        source_document_id: sourceDocumentId || null,
        sort_order: sortOrder,
      }

      const { data: newDoc, error: docError } = await supabase
        .from('documents')
        .insert(docData)
        .select()
        .single()

      if (docError) throw new Error(`Ошибка создания документа: ${docError.message}`)

      // 4. Генерируем путь для файла в Storage (бакет 'files')
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const timestamp = Date.now()
      const filePath = `${workspaceId}/${newDoc.id}/v1_${timestamp}.${fileExt}`

      // 5. Загружаем файл в Storage (бакет 'files')
      const { error: uploadError } = await supabase.storage.from('files').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (uploadError) {
        await supabase.from('documents').delete().eq('id', newDoc.id)
        throw new Error(`Ошибка загрузки файла: ${uploadError.message}`)
      }

      const checksum: string | undefined = undefined

      // 6. Определяем MIME-тип
      let mimeType = file.type || ''

      if (!mimeType || mimeType === 'application/octet-stream') {
        const extension = fileExt.toLowerCase()
        const mimeTypes: Record<string, string> = {
          pdf: 'application/pdf',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xls: 'application/vnd.ms-excel',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          txt: 'text/plain',
        }
        mimeType = mimeTypes[extension] || 'application/octet-stream'
      }

      // 7. Создаём запись в таблице files (единый реестр)
      const { data: filesRecord, error: filesRecordError } = await supabase
        .from('files')
        .insert({
          workspace_id: workspaceId,
          bucket: 'files',
          storage_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: mimeType,
          checksum,
        })
        .select('id')
        .single()

      if (filesRecordError) {
        await supabase.storage.from('files').remove([filePath])
        await supabase.from('documents').delete().eq('id', newDoc.id)
        throw new Error(`Ошибка создания записи файла: ${filesRecordError.message}`)
      }

      // 8. Создаём запись о файле в document_files через функцию БД
      const { data: fileRecord, error: fileError } = await supabase.rpc('add_document_version', {
        p_document_id: newDoc.id,
        p_file_path: filePath,
        p_file_name: file.name,
        p_file_size: file.size,
        p_mime_type: mimeType,
        p_checksum: checksum,
        p_file_id: filesRecord.id,
      })

      if (fileError) {
        await supabase.from('files').delete().eq('id', filesRecord.id)
        await supabase.storage.from('files').remove([filePath])
        await supabase.from('documents').delete().eq('id', newDoc.id)
        throw new Error(`Ошибка сохранения метаданных файла: ${fileError.message}`)
      }

      // 9. Обновляем статус документа на 'in_progress'
      await supabase.from('documents').update({ status: 'in_progress' }).eq('id', newDoc.id)

      return { document: newDoc, fileId: fileRecord }
    },
    onSuccess: (result, variables) => {
      if (!variables.skipInvalidation) {
        invalidateCache(variables.projectId)
      }
      if (result?.document?.id) {
        triggerTextExtraction(result.document.id).then((extracted) => {
          if (extracted) invalidateCache(variables.projectId)
        })
      }
    },
  })

  return {
    uploadDocumentMutation,
    invalidateCache,
  }
}
