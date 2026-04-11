"use client"

/**
 * Хук для управления слотами документов.
 * Инкапсулирует state, refs и callbacks для работы со слотами.
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { MAX_UPLOAD_SIZE } from '@/utils/files/fileValidation'
import type {
  DocumentKitWithDocuments,
  Folder,
  SourceDocumentInfo,
} from '@/components/documents/types'

interface UseSlotHandlersParams {
  kit: DocumentKitWithDocuments | undefined
  projectId: string
  workspaceId: string
  folders: Folder[]
  uploadDocument: (params: {
    file: File
    documentKitId: string
    projectId: string
    workspaceId: string
    folderId: string
    documentName: string
  }) => Promise<{ document?: { id: string } } | null>
  createSlot: (params: {
    folder_id: string
    project_id: string
    workspace_id: string
    name: string
  }) => Promise<{ id: string } | null>
  updateSlot: (params: { slotId: string; updates: { name: string } }) => Promise<void>
  deleteSlot: (slotId: string) => Promise<void>
  deleteEmptySlots: (folderId: string) => Promise<void>
  fillSlot: (params: { slotId: string; documentId: string }) => Promise<void>
  unlinkSlot: (slotId: string) => Promise<void>
  refetchSlots: () => Promise<unknown>
  fetchDocumentKits: (projectId: string) => void
  loadSourceDocuments: () => Promise<void>
  uploadSourceDocumentForSlot: (
    sourceDoc: SourceDocumentInfo,
    folderId: string | null,
  ) => Promise<string | null>
}

export interface SlotHandlers {
  onSlotClick: (slotId: string, folderId: string) => void
  onSlotUnlink: (slotId: string) => Promise<void>
  onSlotDelete: (slotId: string) => Promise<void>
  onDeleteEmptySlots: (folderId: string) => Promise<void>
  onSlotRename: (slotId: string, name: string) => Promise<void>
  onAddSlot: (folderId: string) => Promise<void>
  onSlotDrop: (slotId: string, documentId: string) => Promise<void>
  onSlotDropSourceDoc: (
    slotId: string,
    folderId: string,
    sourceDoc: SourceDocumentInfo,
  ) => Promise<void>
  onClearEditingSlot: () => void
}

interface UseSlotHandlersReturn {
  targetSlotId: string | null
  targetSlotFolderId: string | null
  editingSlotId: string | null
  setEditingSlotId: (id: string | null) => void
  slotFileInputRef: React.RefObject<HTMLInputElement | null>
  slotHandlers: SlotHandlers
  handleSlotFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

export function useSlotHandlers({
  kit,
  projectId,
  workspaceId,
  folders,
  uploadDocument,
  createSlot,
  updateSlot,
  deleteSlot,
  deleteEmptySlots,
  fillSlot,
  unlinkSlot,
  refetchSlots,
  fetchDocumentKits,
  loadSourceDocuments,
  uploadSourceDocumentForSlot,
}: UseSlotHandlersParams): UseSlotHandlersReturn {
  const [targetSlotId, setTargetSlotId] = useState<string | null>(null)
  const [targetSlotFolderId, setTargetSlotFolderId] = useState<string | null>(null)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const slotFileInputRef = useRef<HTMLInputElement>(null)
  const slotClickGuardRef = useRef(false)

  // B-121: refs to avoid stale closures in handleSlotFileChange
  const targetSlotIdRef = useRef<string | null>(null)
  const targetSlotFolderIdRef = useRef<string | null>(null)

  // ref-based guard — предотвращает двойной клик пока файл выбирается
  const handleSlotClick = useCallback((slotId: string, folderId: string) => {
    if (slotClickGuardRef.current) return
    slotClickGuardRef.current = true
    setTargetSlotId(slotId)
    setTargetSlotFolderId(folderId)
    // B-121: sync refs for handleSlotFileChange (avoids stale closure)
    targetSlotIdRef.current = slotId
    targetSlotFolderIdRef.current = folderId
    slotFileInputRef.current?.click()
  }, [])

  const kitId = kit?.id
  // B-121: use refs to read slotId/folderId — avoids stale closure since
  // handleSlotFileChange fires asynchronously after file picker closes
  const handleSlotFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      const currentSlotId = targetSlotIdRef.current
      const currentFolderId = targetSlotFolderIdRef.current

      if (!files || files.length === 0 || !kitId || !currentSlotId || !currentFolderId) {
        setTargetSlotId(null)
        setTargetSlotFolderId(null)
        targetSlotIdRef.current = null
        targetSlotFolderIdRef.current = null
        slotClickGuardRef.current = false
        return
      }

      const file = files[0]
      if (file.size > MAX_UPLOAD_SIZE) {
        toast.error('Файл слишком большой. Максимальный размер: 50 МБ')
        setTargetSlotId(null)
        setTargetSlotFolderId(null)
        targetSlotIdRef.current = null
        targetSlotFolderIdRef.current = null
        slotClickGuardRef.current = false
        e.target.value = ''
        return
      }

      try {
        const result = await uploadDocument({
          file,
          documentKitId: kitId,
          projectId,
          workspaceId,
          folderId: currentFolderId,
          documentName: file.name,
        })

        if (result?.document?.id) {
          await fillSlot({ slotId: currentSlotId, documentId: result.document.id })
        }

        await fetchDocumentKits(projectId)
      } catch (err) {
        logger.error('Ошибка загрузки в слот:', err)
        toast.error('Ошибка при загрузке файла в слот')
      }

      setTargetSlotId(null)
      setTargetSlotFolderId(null)
      targetSlotIdRef.current = null
      targetSlotFolderIdRef.current = null
      slotClickGuardRef.current = false
      e.target.value = ''
    },
    [kitId, uploadDocument, fillSlot, fetchDocumentKits, projectId, workspaceId],
  )

  const handleSlotUnlink = useCallback(
    async (slotId: string) => {
      await unlinkSlot(slotId)
    },
    [unlinkSlot],
  )

  const handleSlotDelete = useCallback(
    async (slotId: string) => {
      await deleteSlot(slotId)
    },
    [deleteSlot],
  )

  const handleDeleteEmptySlots = useCallback(
    async (folderId: string) => {
      await deleteEmptySlots(folderId)
    },
    [deleteEmptySlots],
  )

  const handleSlotRename = useCallback(
    async (slotId: string, name: string) => {
      await updateSlot({ slotId, updates: { name } })
    },
    [updateSlot],
  )

  const handleAddSlot = useCallback(
    async (folderId: string) => {
      const folder = folders.find((f) => f.id === folderId)
      if (!folder) return

      const newSlot = await createSlot({
        folder_id: folderId,
        project_id: projectId,
        workspace_id: workspaceId,
        name: 'Новый слот',
      })
      if (newSlot?.id) setEditingSlotId(newSlot.id)
    },
    [createSlot, projectId, workspaceId, folders],
  )

  const handleSlotDrop = useCallback(
    async (slotId: string, documentId: string) => {
      await fillSlot({ slotId, documentId })
      await refetchSlots()
      await fetchDocumentKits(projectId)
    },
    [fillSlot, refetchSlots, fetchDocumentKits, projectId],
  )

  const handleSlotDropSourceDoc = useCallback(
    async (slotId: string, folderId: string, sourceDoc: SourceDocumentInfo) => {
      const toastId = toast.loading('Перемещение в слот...', { description: sourceDoc.name })
      const documentId = await uploadSourceDocumentForSlot(sourceDoc, folderId)
      if (documentId) {
        await fillSlot({ slotId, documentId })
        await refetchSlots()
        await fetchDocumentKits(projectId)
        await loadSourceDocuments()
        toast.success('Документ помещён в слот', { id: toastId, duration: 3000 })
      } else {
        toast.error('Ошибка перемещения в слот', { id: toastId })
      }
    },
    [
      uploadSourceDocumentForSlot,
      fillSlot,
      refetchSlots,
      fetchDocumentKits,
      projectId,
      loadSourceDocuments,
    ],
  )

  const handleClearEditingSlot = useCallback(() => setEditingSlotId(null), [])

  const slotHandlers = useMemo(
    () => ({
      onSlotClick: handleSlotClick,
      onSlotUnlink: handleSlotUnlink,
      onSlotDelete: handleSlotDelete,
      onDeleteEmptySlots: handleDeleteEmptySlots,
      onSlotRename: handleSlotRename,
      onAddSlot: handleAddSlot,
      onSlotDrop: handleSlotDrop,
      onSlotDropSourceDoc: handleSlotDropSourceDoc,
      onClearEditingSlot: handleClearEditingSlot,
    }),
    [
      handleSlotClick,
      handleSlotUnlink,
      handleSlotDelete,
      handleDeleteEmptySlots,
      handleSlotRename,
      handleAddSlot,
      handleSlotDrop,
      handleSlotDropSourceDoc,
      handleClearEditingSlot,
    ],
  )

  return {
    targetSlotId,
    targetSlotFolderId,
    editingSlotId,
    setEditingSlotId,
    slotFileInputRef,
    slotHandlers,
    handleSlotFileChange,
  }
}
