"use client"

/**
 * Хук для генерации сводки по набору документов
 *
 * Используется и на вкладке «Карточки», и на вкладке «Документы».
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { getCommentsByEntity } from '@/services/api/commentService'
import type {
  DocumentKit,
  DocumentStatus,
  FolderSlotWithDocument,
} from '@/components/documents/types'

interface DocumentKitWithFolders extends DocumentKit {
  folders?: Array<{
    id: string
    name: string
    description?: string | null
    status: string | null
  }>
  documents?: Array<{
    id: string
    name: string
    status: string | null
    folder_id: string | null
    is_deleted?: boolean
  }>
}

interface UseDocumentSummaryParams {
  folderSlots: FolderSlotWithDocument[]
  folderStatuses: DocumentStatus[]
  workspaceId: string
}

export function useDocumentSummary({
  folderSlots,
  folderStatuses,
  workspaceId,
}: UseDocumentSummaryParams) {
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const generateSummary = useCallback(
    async (kits: DocumentKit | DocumentKit[]) => {
      setSummaryLoading(true)
      setSummaryDialogOpen(true)
      setSummaryText('')
      setCopied(false)

      try {
        const kitArray = Array.isArray(kits) ? kits : [kits]
        const lines: string[] = ['По документам:']
        let globalFolderIdx = 0

        for (const kit of kitArray) {
          const kitData = kit as DocumentKitWithFolders
          const folders = kitData.folders || []

          if (kitArray.length > 1 && folders.length > 0) {
            lines.push(`\n📁 **${kitData.name}**`)
          }

          const kitFolderIds = new Set(folders.map((f) => f.id))

          // Слоты этого набора
          const kitSlots = folderSlots.filter((s) => kitFolderIds.has(s.folder_id))
          const slotsByFolderId = new Map<string, FolderSlotWithDocument[]>()
          for (const slot of kitSlots) {
            const arr = slotsByFolderId.get(slot.folder_id) || []
            arr.push(slot)
            slotsByFolderId.set(slot.folder_id, arr)
          }

          // Документы, сгруппированные по папкам (без слотовых)
          const allDocs = kitData.documents || []
          const slotDocIds = new Set<string>()
          for (const slot of kitSlots) {
            if (slot.document_id) slotDocIds.add(slot.document_id)
          }
          const docsByFolder = new Map<string, typeof allDocs>()
          for (const doc of allDocs) {
            if (doc.is_deleted || slotDocIds.has(doc.id)) continue
            if (!doc.folder_id) continue
            const arr = docsByFolder.get(doc.folder_id) || []
            arr.push(doc)
            docsByFolder.set(doc.folder_id, arr)
          }

          // Загружаем комментарии для всех папок
          const commentPromises = folders.map((f) =>
            getCommentsByEntity('document_folder', f.id, workspaceId).catch(() => []),
          )
          const commentsPerFolder = await Promise.all(commentPromises)

          for (const [idx, folder] of folders.entries()) {
            globalFolderIdx++
            const fStatus = folderStatuses.find((s) => s.id === folder.status)
            const statusIcon = fStatus?.is_final
              ? '✅'
              : fStatus?.color === '#ef4444' || fStatus?.name?.toLowerCase().includes('отклон')
                ? '❌'
                : fStatus
                  ? '🔵'
                  : '⬜'

            const fSlots = slotsByFolderId.get(folder.id) || []
            const folderDocs = docsByFolder.get(folder.id) || []
            const hasAnyDocument =
              fSlots.some((s) => s.document_id && s.document) || folderDocs.length > 0

            const folderIcon = hasAnyDocument ? statusIcon : '❌'
            lines.push(`${folderIcon} ${globalFolderIdx}. **${folder.name.toUpperCase()}**`)

            // Незаполненные слоты
            const emptySlots = fSlots.filter((s) => !s.document_id)
            for (const slot of emptySlots) {
              lines.push(`  ⚠️ Не загружен: ${slot.name}`)
            }

            // Незавершённые комментарии к папке
            const folderComments = commentsPerFolder[idx] || []
            const unresolvedThreads = folderComments.filter((t) => !t.root.is_resolved)
            for (const thread of unresolvedThreads) {
              const allMessages = [thread.root, ...thread.replies]
              for (const msg of allMessages) {
                lines.push(`> ${msg.content}`)
              }
            }

            lines.push('')
          }
        }

        setSummaryText(lines.join('\n').trim())
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Неизвестная ошибка'
        setSummaryText(`Ошибка при формировании сводки: ${detail}`)
      } finally {
        setSummaryLoading(false)
      }
    },
    [folderSlots, folderStatuses, workspaceId],
  )

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopySummary = useCallback(() => {
    navigator.clipboard.writeText(summaryText).catch(() => {
      toast.error('Не удалось скопировать')
    })
    setCopied(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }, [summaryText])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

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
