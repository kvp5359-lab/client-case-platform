"use client"

/**
 * Компонент набора документов — заголовок + список папок с документами
 */

import { useMemo, memo } from 'react'
import {
  ChevronRight,
  MoreHorizontal,
  FileText,
  FolderPlus,
  Trash2,
  Download,
  RefreshCw,
  HardDrive,
  ArrowUp,
  ArrowDown,
  Cloud,
  CloudDownload,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useGroupedDocuments } from '@/hooks/documents/useGroupedDocuments'
import {
  useKitSourceDocumentsQuery,
  useSyncKitSourceMutation,
} from '@/hooks/documents/useSourceDocumentsQuery'
import { getCurrentDocumentFile } from '@/utils/documentUtils'
import { formatSize } from '@/utils/files/formatSize'
import { FolderCard } from './FolderCard'
import { KitSourceFileRow } from './KitSourceFileRow'
import { useDocumentsContext } from './DocumentsContext'
import type { DocumentStatus, FolderSlotWithDocument } from '@/components/documents/types'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { SourceDocument } from '@/types/documents'

const EMPTY_SLOTS: FolderSlotWithDocument[] = []
const EMPTY_SOURCE: SourceDocument[] = []

export type KitSlotHandlers = {
  onSlotClick: (slotId: string, folderId: string) => void
  onAddSlot?: (folderId: string) => void
  onSlotDrop: (slotId: string, documentId: string) => void
  onSlotDelete: (slotId: string) => void
  onSlotRename: (slotId: string, name: string) => void
}

export type KitDocumentHandlers = {
  onStatusChange: (docId: string, status: string | null) => void
  onFolderStatusChange: (folderId: string, status: string | null) => void
  onOpenEdit: (docId: string) => void
  onAddDocument?: (folderId: string) => void
  onOpenDocument: (docId: string) => void
  onDownloadDocument: (docId: string) => void
  onDeleteDocument: (docId: string) => void
  onCompressDocument: (docId: string) => void
}

export type KitDocumentsProps = {
  kit: DocumentKitWithDocuments
  kitName: string
  onToggleKit: () => void
  onGenerateSummary: () => void
  filterMode: 'all' | 'action-required'
  searchQuery: string
  folderStatuses: DocumentStatus[]
  folderSlots: FolderSlotWithDocument[]
  newSlotId: string | null
  onNewSlotCreated: () => void
  slotHandlers: KitSlotHandlers
  documentHandlers: KitDocumentHandlers
  onAddFolder?: (kitId: string) => void
  onSyncKit: (kit: DocumentKitWithDocuments) => void
  onDeleteKit: (kit: DocumentKitWithDocuments) => void
  onDownloadKit: (kit: DocumentKitWithDocuments) => void
  onEditFolder?: (folderId: string) => void
  onDeleteFolder?: (folderId: string) => void
  onCreateDriveFolders?: (kit: DocumentKitWithDocuments) => void
  onMoveKit?: (kit: DocumentKitWithDocuments, direction: 'up' | 'down') => void
  isFirst?: boolean
  isLast?: boolean
  /** Показывать скрытые файлы источника в лотке. */
  showHiddenSource?: boolean
}

export const KitDocuments = memo(function KitDocuments({
  kit,
  kitName,
  onToggleKit,
  onGenerateSummary,
  filterMode,
  searchQuery,
  folderStatuses,
  folderSlots,
  newSlotId,
  onNewSlotCreated,
  slotHandlers,
  documentHandlers,
  onAddFolder,
  onSyncKit,
  onDeleteKit,
  onDownloadKit,
  onEditFolder,
  onDeleteFolder,
  onCreateDriveFolders,
  onMoveKit,
  isFirst,
  isLast,
  showHiddenSource = false,
}: KitDocumentsProps) {
  const { statuses } = useDocumentsContext()
  // Старая sidePanelStore.panelTab уже не используется новой системой
  // вкладок — берём состояние и из TaskPanelContext (видна ли панель).
  const layoutPanel = useLayoutTaskPanel()
  const sidePanelOpen =
    useSidePanelStore((s) => s.panelTab !== null) ||
    !!(layoutPanel?.hasTabs && !layoutPanel?.isHidden)
  const { onSlotClick, onAddSlot, onSlotDrop, onSlotDelete, onSlotRename } = slotHandlers
  const { onFolderStatusChange, onAddDocument } = documentHandlers
  const folders = useMemo(() => kit.folders || [], [kit.folders])
  const documents = useMemo(() => kit.documents || [], [kit.documents])

  const kitFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders])

  // Суммарный размер файлов набора (по текущей версии каждого документа).
  // Считаем только реально видимые: не удалённые и принадлежащие папкам этого набора.
  const totalSize = useMemo(
    () =>
      documents.reduce((sum, doc) => {
        if (doc.is_deleted === true) return sum
        if (!doc.folder_id || !kitFolderIds.has(doc.folder_id)) return sum
        const file = getCurrentDocumentFile(doc.document_files)
        return sum + (file?.file_size ?? 0)
      }, 0),
    [documents, kitFolderIds],
  )

  const slotsByFolder = useMemo(() => {
    const map = new Map<string, FolderSlotWithDocument[]>()
    for (const slot of folderSlots) {
      if (!kitFolderIds.has(slot.folder_id)) continue
      const arr = map.get(slot.folder_id) || []
      arr.push(slot)
      map.set(slot.folder_id, arr)
    }
    return map
  }, [folderSlots, kitFolderIds])

  // Файлы источника Google Drive набора («лоток»): грузим только для наборов,
  // созданных из папки Drive. Группируем по имени Drive-подпапки, чтобы показать
  // под сохранёнными документами одноимённой папки набора.
  const { data: kitSourceDocs = EMPTY_SOURCE } = useKitSourceDocumentsQuery(
    kit.id,
    !!kit.drive_folder_id,
    showHiddenSource,
  )
  // Группируем файлы источника по id Drive-подпапки первого уровня — сопоставление
  // с папкой набора идёт по folder.drive_folder_id (устойчиво к переименованию).
  const sourceByDriveFolderId = useMemo(() => {
    const map = new Map<string, SourceDocument[]>()
    for (const doc of kitSourceDocs) {
      const key = doc.parentDriveFolderId || ''
      const arr = map.get(key) || []
      arr.push(doc)
      map.set(key, arr)
    }
    return map
  }, [kitSourceDocs])

  // Файлы из корня папки Drive (без подпапки) — им нет папки набора, показываем
  // отдельным блоком на уровне набора.
  const rootSourceDocs = useMemo(
    () => sourceByDriveFolderId.get('') || EMPTY_SOURCE,
    [sourceByDriveFolderId],
  )

  // Синхронизация файлов набора из папки-источника Google Drive.
  const syncKitSource = useSyncKitSourceMutation()
  const handleSyncKitSource = () => {
    if (!kit.drive_folder_id || syncKitSource.isPending) return
    const toastId = toast.loading('Проверяю источник…')
    syncKitSource.mutate(
      {
        projectId: kit.project_id,
        workspaceId: kit.workspace_id,
        kitId: kit.id,
        driveFolderId: kit.drive_folder_id,
      },
      {
        onSuccess: (r) =>
          toast.success(
            `Источник обновлён — файлов: ${r.filesFound}${r.deleted ? `, убрано: ${r.deleted}` : ''}`,
            { id: toastId },
          ),
        onError: () => toast.error('Не удалось обновить источник', { id: toastId }),
      },
    )
  }

  const slotDocumentIds = useMemo(() => {
    const ids = new Set<string>()
    slotsByFolder.forEach((slots) => {
      slots.forEach((s) => {
        if (s.document_id) ids.add(s.document_id)
      })
    })
    return ids
  }, [slotsByFolder])

  const { documentsByFolder } = useGroupedDocuments({
    documents,
    showOnlyUnverified: false,
    slotDocumentIds,
  })

  const searchLower = searchQuery.toLowerCase().trim()

  const filteredDocsByFolder = useMemo(() => {
    if (!searchLower) return documentsByFolder
    const filtered = new Map<string, typeof documents>()
    documentsByFolder.forEach((docs, folderId) => {
      const matched = docs.filter((d) => d.name.toLowerCase().includes(searchLower))
      if (matched.length > 0) filtered.set(folderId, matched)
    })
    return filtered
  }, [documentsByFolder, searchLower])

  const filteredSlotsByFolder = useMemo(() => {
    if (!searchLower) return slotsByFolder
    const filtered = new Map<string, FolderSlotWithDocument[]>()
    slotsByFolder.forEach((slots, folderId) => {
      const matched = slots.filter((s) => {
        if (s.document) return s.document.name.toLowerCase().includes(searchLower)
        return s.name.toLowerCase().includes(searchLower)
      })
      if (matched.length > 0) filtered.set(folderId, matched)
    })
    return filtered
  }, [slotsByFolder, searchLower])

  const visibleFolders = useMemo(() => {
    const baseFolders = searchLower
      ? folders.filter((folder) => {
          const hasDocs = (filteredDocsByFolder.get(folder.id) || []).length > 0
          const hasSlots = (filteredSlotsByFolder.get(folder.id) || []).length > 0
          return hasDocs || hasSlots
        })
      : folders

    if (filterMode === 'all') return baseFolders
    return baseFolders.filter((folder) => {
      const docs = filteredDocsByFolder.get(folder.id) || []
      const folderSlotList = filteredSlotsByFolder.get(folder.id) || []
      const hasActionDocs = docs.some((doc) => {
        const status = statuses.find((s) => s.id === doc.status)
        return !status?.is_final
      })
      const hasActionSlots = folderSlotList.some((slot) => {
        if (!slot.document_id) return true
        const doc = slot.document
        if (!doc) return true
        const status = statuses.find((s) => s.id === doc.status)
        return !status?.is_final
      })
      return hasActionDocs || hasActionSlots
    })
  }, [folders, filterMode, searchLower, filteredDocsByFolder, filteredSlotsByFolder, statuses])

  if (folders.length === 0 && documents.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Нет документов</h3>
          <p className="text-muted-foreground">В этом наборе пока нет документов и папок</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2 w-full', !sidePanelOpen && 'max-w-[789px]')}>
      <div className="bg-white rounded-2xl py-2 pr-0.5 md:pr-2">
        <div className="flex items-center gap-3 pl-1 pr-3 pt-0.5 pb-1">
          <button
            type="button"
            onClick={onToggleKit}
            className="flex items-center gap-2 group shrink-0"
          >
            <h3 className="text-xl font-bold text-foreground uppercase tracking-wide text-left">
              {kitName}
            </h3>
            <ChevronRight className="h-4 w-4 text-muted-foreground/70 transition-transform rotate-90" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onAddFolder?.(kit.id)}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Добавить отдельную папку
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onGenerateSummary}>
                <FileText className="h-4 w-4 mr-2" />
                Сводка по документам
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownloadKit(kit)}>
                <Download className="h-4 w-4 mr-2" />
                Скачать документы
              </DropdownMenuItem>
              {onCreateDriveFolders && (
                <DropdownMenuItem onClick={() => onCreateDriveFolders(kit)}>
                  <HardDrive className="h-4 w-4 mr-2" />
                  Создать папки на Google Drive
                </DropdownMenuItem>
              )}
              {kit.drive_folder_id && (
                <DropdownMenuItem onClick={handleSyncKitSource}>
                  <CloudDownload className="h-4 w-4 mr-2" />
                  Обновить файлы из источника
                </DropdownMenuItem>
              )}
              {kit.template_id && (
                <DropdownMenuItem onClick={() => onSyncKit(kit)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Обновить состав набора
                </DropdownMenuItem>
              )}
              {onMoveKit && (!isFirst || !isLast) && (
                <>
                  <DropdownMenuSeparator />
                  {!isFirst && (
                    <DropdownMenuItem onClick={() => onMoveKit(kit, 'up')}>
                      <ArrowUp className="h-4 w-4 mr-2" />
                      Переместить вверх
                    </DropdownMenuItem>
                  )}
                  {!isLast && (
                    <DropdownMenuItem onClick={() => onMoveKit(kit, 'down')}>
                      <ArrowDown className="h-4 w-4 mr-2" />
                      Переместить вниз
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDeleteKit(kit)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить набор
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {totalSize > 0 && (
            <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium text-gray-400 bg-gray-100 tabular-nums">
              {formatSize(totalSize)}
            </span>
          )}
        </div>
        {visibleFolders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            documents={filteredDocsByFolder.get(folder.id) || []}
            folderStatuses={folderStatuses}
            onFolderStatusChange={onFolderStatusChange}
            onAddDocument={onAddDocument}
            slots={filteredSlotsByFolder.get(folder.id) || EMPTY_SLOTS}
            onSlotClick={onSlotClick}
            onAddSlot={onAddSlot}
            onSlotDrop={onSlotDrop}
            onSlotDelete={onSlotDelete}
            onSlotRename={onSlotRename}
            newSlotId={newSlotId}
            onNewSlotCreated={onNewSlotCreated}
            filterMode={filterMode}
            onEditFolder={onEditFolder}
            onDeleteFolder={onDeleteFolder}
            sourceDocuments={sourceByDriveFolderId.get(folder.drive_folder_id || '') || EMPTY_SOURCE}
          />
        ))}
        {rootSourceDocs.length > 0 && (
          <div className="mx-1 mt-2 border-t border-dashed border-muted-foreground/20 pt-2">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              <Cloud className="h-3 w-3" />
              Из источника — в корне ({rootSourceDocs.length})
            </div>
            <div className="flex flex-col gap-0.5">
              {rootSourceDocs.map((doc) => (
                <KitSourceFileRow key={doc.sourceDocumentId} doc={doc} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
