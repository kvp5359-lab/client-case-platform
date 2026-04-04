"use client"

/**
 * Мутации документов — удаление, восстановление, перемещение, статус, reorder
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DocumentKitWithDocuments, FolderSlotWithDocument } from '@/components/documents/types'
import { documentKitKeys, folderSlotKeys, kitlessDocumentKeys } from '@/hooks/queryKeys'

export function useDocumentMutations(
  projectId: string | undefined,
  invalidateCache: (overrideProjectId?: string) => void,
) {
  const queryClient = useQueryClient()

  /** Перемещение документа в корзину (мягкое удаление) */
  const softDeleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from('documents')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', documentId)

      if (error) throw new Error(`Ошибка перемещения в корзину: ${error.message}`)
    },
    onMutate: (documentId: string) => {
      if (!projectId) return
      queryClient.setQueryData<DocumentKitWithDocuments[]>(
        documentKitKeys.byProject(projectId),
        (prev) =>
          prev?.map((kit) => ({
            ...kit,
            documents: kit.documents?.filter((d) => d.id !== documentId) ?? [],
          })),
      )
    },
    onSuccess: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  /** Полное удаление документа (вместе с файлами) */
  const hardDeleteDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { data: files, error: filesError } = await supabase
        .from('document_files')
        .select('file_path, file_id')
        .eq('document_id', documentId)

      if (filesError) throw new Error(`Ошибка получения файлов: ${filesError.message}`)

      if (files && files.length > 0) {
        for (const df of files) {
          if (df.file_id) {
            const { count: dfCount } = await supabase
              .from('document_files')
              .select('id', { count: 'exact', head: true })
              .eq('file_id', df.file_id)
              .neq('document_id', documentId)
            const { count: maCount } = await supabase
              .from('message_attachments')
              .select('id', { count: 'exact', head: true })
              .eq('file_id', df.file_id)
            const totalRefs = (dfCount || 0) + (maCount || 0)

            if (totalRefs === 0) {
              const { data: fileRecord } = await supabase
                .from('files')
                .select('bucket, storage_path')
                .eq('id', df.file_id)
                .single()
              if (fileRecord) {
                await supabase.storage.from(fileRecord.bucket).remove([fileRecord.storage_path])
              }
              await supabase.from('files').delete().eq('id', df.file_id)
            }
          } else {
            await supabase.storage.from('document-files').remove([df.file_path])
          }
        }
      }

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', documentId)
      if (deleteError) throw new Error(`Ошибка удаления документа: ${deleteError.message}`)
    },
    onSuccess: () => {
      invalidateCache()
    },
  })

  /** Восстановление документа из корзины */
  const restoreDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from('documents')
        .update({
          is_deleted: false,
          deleted_at: null,
        })
        .eq('id', documentId)

      if (error) throw new Error(`Ошибка восстановления документа: ${error.message}`)
    },
    onSuccess: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  /** Перемещение документа в другую папку */
  const moveDocumentMutation = useMutation({
    mutationFn: async ({
      documentId,
      folderId,
    }: {
      documentId: string
      folderId: string | null
    }) => {
      const updateData: Record<string, string | null> = { folder_id: folderId }

      if (folderId) {
        const { data: folder } = await supabase
          .from('folders')
          .select('document_kit_id')
          .eq('id', folderId)
          .single()

        if (folder?.document_kit_id) {
          updateData.document_kit_id = folder.document_kit_id
        }
      } else {
        updateData.document_kit_id = null

        const { error: slotError } = await supabase
          .from('folder_slots')
          .update({ document_id: null })
          .eq('document_id', documentId)
        if (slotError) throw new Error(`Ошибка отвязки слота: ${slotError.message}`)
      }

      const { error } = await supabase.from('documents').update(updateData).eq('id', documentId)
      if (error) throw new Error(`Ошибка перемещения документа: ${error.message}`)
    },
    onSuccess: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  /** Изменение статуса документа */
  const updateDocumentStatusMutation = useMutation({
    mutationFn: async ({ documentId, status }: { documentId: string; status: string | null }) => {
      const { error } = await supabase.from('documents').update({ status }).eq('id', documentId)
      if (error) throw new Error(`Ошибка обновления статуса: ${error.message}`)
    },
    onMutate: async ({ documentId, status }) => {
      if (!projectId) return {}

      const qk = documentKitKeys.byProject(projectId)
      const sqk = folderSlotKeys.byProject(projectId)
      await queryClient.cancelQueries({ queryKey: qk })
      await queryClient.cancelQueries({ queryKey: sqk })
      const previous = queryClient.getQueryData(qk)
      const previousSlots = queryClient.getQueryData(sqk)

      queryClient.setQueryData<DocumentKitWithDocuments[]>(qk, (old) => {
        if (!Array.isArray(old)) return old
        return old.map((kit) => ({
          ...kit,
          documents: kit.documents?.map((doc) =>
            doc.id === documentId ? { ...doc, status } : doc,
          ),
        }))
      })

      queryClient.setQueryData<FolderSlotWithDocument[]>(sqk, (old) => {
        if (!Array.isArray(old)) return old
        return old.map((slot) =>
          slot.document?.id === documentId
            ? { ...slot, document: { ...slot.document, status } }
            : slot,
        )
      })

      return { previous, previousSlots, qk, sqk }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous && context.qk) {
        queryClient.setQueryData(context.qk, context.previous)
      }
      if (context?.previousSlots && context.sqk) {
        queryClient.setQueryData(context.sqk, context.previousSlots)
      }
    },
    onSettled: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  /** Изменение порядка документов (drag & drop) */
  const reorderDocumentsMutation = useMutation({
    mutationFn: async (
      updates: Array<{
        id: string
        sort_order: number
        folder_id?: string | null
        document_kit_id?: string
      }>,
    ) => {
      const { error } = await supabase.rpc('reorder_documents', {
        p_updates: updates,
      })
      if (error) throw new Error(`Ошибка обновления порядка: ${error.message}`)
    },
    onSuccess: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  /** Дублирование документа в указанную папку */
  const duplicateDocumentMutation = useMutation({
    mutationFn: async ({
      documentId,
      folderId,
    }: {
      documentId: string
      folderId: string | null
    }) => {
      // 1. Получить исходный документ
      const { data: srcDoc, error: srcError } = await supabase
        .from('documents')
        .select(
          'name, description, status, project_id, workspace_id, document_kit_id, folder_id, text_content',
        )
        .eq('id', documentId)
        .single()
      if (srcError || !srcDoc) throw new Error('Не удалось получить документ')

      // 2. Определить document_kit_id по целевой папке
      let targetKitId = srcDoc.document_kit_id
      if (folderId) {
        const { data: folder } = await supabase
          .from('folders')
          .select('document_kit_id')
          .eq('id', folderId)
          .single()
        if (folder?.document_kit_id) targetKitId = folder.document_kit_id
      } else {
        targetKitId = null
      }

      // 3. Создать копию документа
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert({
          name: `${srcDoc.name} (копия)`,
          description: srcDoc.description,
          status: srcDoc.status,
          project_id: srcDoc.project_id,
          workspace_id: srcDoc.workspace_id,
          document_kit_id: targetKitId,
          folder_id: folderId,
          text_content: srcDoc.text_content,
        })
        .select('id')
        .single()
      if (insertError || !newDoc) throw new Error(`Ошибка создания копии: ${insertError?.message}`)

      // 4. Скопировать текущий document_file (ссылка на тот же file_id)
      const { data: currentFile } = await supabase
        .from('document_files')
        .select('file_path, file_name, file_size, mime_type, checksum, file_id, workspace_id')
        .eq('document_id', documentId)
        .eq('is_current', true)
        .maybeSingle()

      if (currentFile) {
        await supabase.from('document_files').insert({
          document_id: newDoc.id,
          workspace_id: currentFile.workspace_id,
          version: 1,
          is_current: true,
          file_path: currentFile.file_path,
          file_name: currentFile.file_name,
          file_size: currentFile.file_size,
          mime_type: currentFile.mime_type,
          checksum: currentFile.checksum,
          file_id: currentFile.file_id,
        })
      }

      return newDoc.id
    },
    onSuccess: () => {
      invalidateCache()
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      }
    },
  })

  return {
    softDeleteDocumentMutation,
    hardDeleteDocumentMutation,
    restoreDocumentMutation,
    moveDocumentMutation,
    updateDocumentStatusMutation,
    reorderDocumentsMutation,
    duplicateDocumentMutation,
  }
}
