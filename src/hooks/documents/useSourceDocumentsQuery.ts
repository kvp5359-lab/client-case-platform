"use client"

/**
 * React Query хук для source documents (Google Drive папка-источник).
 *
 * Заменяет ручное хранение sourceDocuments в Zustand store.
 * Данные кэшируются React Query, инвалидируются после мутаций.
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  getSourceDocumentsByProject,
  getSourceDocumentsByKit,
  getDocumentSourcesByProject,
  getDocumentSourcesByWorkspace,
  getWorkspaceSourceUpdates,
  ensureDocumentSource,
  deleteDocumentSource,
  toggleSourceDocumentHidden,
  syncSourceDocumentsFromDrive,
} from '@/services/documents/sourceDocumentService'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { googleDriveKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { SourceDocument } from '@/types/documents'

type SourceDocumentsResult = {
  documents: SourceDocument[]
  usedSourceIds: Set<string>
}

/**
 * Загружает raw данные из БД и трансформирует в SourceDocument[].
 * Фильтрация hidden/used происходит позже — в `select`.
 */
async function fetchSourceDocuments(projectId: string): Promise<SourceDocumentsResult> {
  const { documents: sourceDocs, usedSourceIds } =
    await getSourceDocumentsByProject(projectId)

  const availableDocs = sourceDocs.filter((doc) => !usedSourceIds.has(doc.id))

  const formattedDocs: SourceDocument[] = availableDocs.map((doc) => ({
    id: doc.google_drive_file_id,
    name: doc.name,
    mimeType: doc.mime_type || '',
    size: doc.file_size || undefined,
    createdTime: doc.created_time || undefined,
    modifiedTime: doc.modified_time || undefined,
    webViewLink: doc.web_view_link || undefined,
    iconLink: doc.icon_link || undefined,
    parentFolderName: doc.parent_folder_name || undefined,
    parentDriveFolderId: doc.parent_drive_folder_id || undefined,
    sourceId: doc.source_id || undefined,
    sourceDocumentId: doc.id,
    isHidden: doc.is_hidden || undefined,
  }))

  return { documents: formattedDocs, usedSourceIds }
}

/**
 * React Query хук: загружает source documents для проекта.
 *
 * @param projectId - ID проекта
 * @param showHidden - показывать скрытые документы (фильтрация через `select`)
 */
export function useSourceDocumentsQuery(projectId: string | undefined, showHidden = false) {
  return useQuery({
    queryKey: googleDriveKeys.sourceDocuments(projectId ?? ''),
    queryFn: () => fetchSourceDocuments(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
    select: (result) => {
      if (showHidden) return result.documents
      return result.documents.filter((doc) => !doc.isHidden)
    },
  })
}

/**
 * Загружает файлы источника, привязанные к набору (для показа внутри папок).
 */
async function fetchKitSourceDocuments(kitId: string): Promise<SourceDocument[]> {
  const { documents: sourceDocs, usedSourceIds } = await getSourceDocumentsByKit(kitId)

  return sourceDocs
    .filter((doc) => !usedSourceIds.has(doc.id))
    .map((doc) => ({
      id: doc.google_drive_file_id,
      name: doc.name,
      mimeType: doc.mime_type || '',
      size: doc.file_size || undefined,
      createdTime: doc.created_time || undefined,
      modifiedTime: doc.modified_time || undefined,
      webViewLink: doc.web_view_link || undefined,
      iconLink: doc.icon_link || undefined,
      parentFolderName: doc.parent_folder_name || undefined,
      parentDriveFolderId: doc.parent_drive_folder_id || undefined,
      sourceId: doc.source_id || undefined,
      sourceDocumentId: doc.id,
      isHidden: doc.is_hidden || undefined,
    }))
}

/**
 * React Query хук: файлы источника Google Drive, привязанные к набору.
 * Показываются внутри папок набора («лоток»). Скрытые исключаются.
 */
export function useKitSourceDocumentsQuery(
  kitId: string | undefined,
  enabled = true,
  showHidden = false,
) {
  return useQuery({
    queryKey: googleDriveKeys.kitSourceDocuments(kitId ?? ''),
    queryFn: () => fetchKitSourceDocuments(kitId!),
    enabled: !!kitId && enabled,
    staleTime: STALE_TIME.MEDIUM,
    select: (docs) => (showHidden ? docs : docs.filter((doc) => !doc.isHidden)),
  })
}

/**
 * Хелпер: возвращает функцию для инвалидации кэша source documents.
 * Вызывать после мутаций (toggle hidden, sync, upload source doc).
 */
export function useInvalidateSourceDocuments() {
  const queryClient = useQueryClient()
  return useCallback(
    (projectId: string) =>
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.sourceDocuments(projectId),
      }),
    [queryClient],
  )
}

/**
 * Инвалидация лотков источника всех наборов проекта (broad-префикс).
 * Вызывать после приёма/переноса файла из источника в набор.
 */
export function useInvalidateKitSourceDocuments() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.kitSourceDocumentsAll(),
      }),
    [queryClient],
  )
}

/**
 * Сбрасывает ОБА представления источников — правую панель «Из источника» и
 * лотки наборов. Вызывать при любом изменении файла источника (скрытие, приём,
 * синхронизация), чтобы панель и лоток были согласованы.
 */
export function useInvalidateAllSourceViews() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.sourceDocumentsAll() }),
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.kitSourceDocumentsAll() }),
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.workspaceSourceUpdatesAll() }),
      ]),
    [queryClient],
  )
}

/**
 * Скрыть/показать файл источника (флаг is_hidden). В лотке набора файлы всегда
 * не скрыты (скрытые отфильтрованы), поэтому кнопка их прячет; вернуть — через
 * будущий фильтр «показать скрытые».
 */
export function useToggleKitSourceHidden() {
  const invalidateAll = useInvalidateAllSourceViews()
  return useMutation({
    mutationFn: ({ sourceDocId, hidden }: { sourceDocId: string; hidden: boolean }) =>
      toggleSourceDocumentHidden(sourceDocId, hidden),
    // Синхронно обновляем и панель, и лотки — is_hidden общий флаг.
    onSuccess: () => invalidateAll(),
    onError: () => toast.error('Не удалось скрыть файл'),
  })
}

/**
 * Синхронизация файлов набора из папки-источника Google Drive: проверяет, есть
 * ли новые/удалённые файлы, и обновляет лоток.
 */
export function useSyncKitSourceMutation() {
  const invalidateAll = useInvalidateAllSourceViews()
  return useMutation({
    mutationFn: ({
      projectId,
      workspaceId,
      kitId,
      driveFolderId,
    }: {
      projectId: string
      workspaceId: string
      kitId: string
      driveFolderId: string
    }) =>
      syncSourceDocumentsFromDrive({
        projectId,
        workspaceId,
        sourceFolderId: driveFolderId,
        documentKitId: kitId,
        groupByTopLevel: true,
      }),
    onSuccess: () => invalidateAll(),
  })
}

/**
 * Синхронизация конкретного источника (по записи document_sources): проверяет
 * новые/удалённые файлы в его папке Drive. Наборный — с группировкой по папке
 * первого уровня; отдельный — по ближайшей папке.
 */
export function useSyncDocumentSourceMutation() {
  const invalidateAll = useInvalidateAllSourceViews()
  return useMutation({
    mutationFn: ({
      projectId,
      workspaceId,
      driveFolderId,
      documentKitId,
      sourceName,
    }: {
      projectId: string
      workspaceId: string
      driveFolderId: string
      documentKitId: string | null
      sourceName: string | null
    }) =>
      syncSourceDocumentsFromDrive({
        projectId,
        workspaceId,
        sourceFolderId: driveFolderId,
        documentKitId,
        sourceName,
        groupByTopLevel: !!documentKitId,
      }),
    onSuccess: () => invalidateAll(),
  })
}

/**
 * Синхронизация ВСЕХ источников проекта (по всем наборам + отдельные).
 * Возвращает сводку: сколько источников проверено, файлов найдено/убрано.
 */
export function useSyncAllSourcesMutation() {
  const invalidateAll = useInvalidateAllSourceViews()
  return useMutation({
    mutationFn: async ({
      projectId,
      workspaceId,
    }: {
      projectId: string
      workspaceId: string
    }) => {
      const sources = await getDocumentSourcesByProject(projectId)
      let filesFound = 0
      let deleted = 0
      let synced = 0
      for (const s of sources) {
        try {
          const r = await syncSourceDocumentsFromDrive({
            projectId,
            workspaceId,
            sourceFolderId: s.drive_folder_id,
            documentKitId: s.document_kit_id,
            sourceName: s.name,
            groupByTopLevel: !!s.document_kit_id,
          })
          filesFound += r.filesFound
          deleted += r.deleted
          synced += 1
        } catch {
          // пропускаем сбойный источник, остальные синхронизируем
        }
      }
      return { total: sources.length, synced, filesFound, deleted }
    },
    onSuccess: () => invalidateAll(),
  })
}

/**
 * Лента файлов из источников по всему воркспейсу («Обновления источников»).
 * Плоский список, сортировка/группировка — на стороне страницы.
 */
export function useWorkspaceSourceUpdatesQuery(workspaceId: string | undefined) {
  return useQuery({
    queryKey: googleDriveKeys.workspaceSourceUpdates(workspaceId ?? ''),
    queryFn: () => getWorkspaceSourceUpdates(workspaceId!),
    enabled: !!workspaceId,
    staleTime: STALE_TIME.MEDIUM,
  })
}

/**
 * Синхронизация ВСЕХ источников воркспейса (по всем проектам). Для кнопки
 * «Проверить источники» на странице обновлений. Сбойный источник пропускается.
 */
export function useSyncWorkspaceSourcesMutation() {
  const queryClient = useQueryClient()
  const invalidateAll = useInvalidateAllSourceViews()
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const sources = await getDocumentSourcesByWorkspace(workspaceId)
      let filesFound = 0
      let deleted = 0
      let synced = 0
      for (const s of sources) {
        try {
          const r = await syncSourceDocumentsFromDrive({
            projectId: s.project_id,
            workspaceId,
            sourceFolderId: s.drive_folder_id,
            documentKitId: s.document_kit_id,
            sourceName: s.name,
            groupByTopLevel: !!s.document_kit_id,
          })
          filesFound += r.filesFound
          deleted += r.deleted
          synced += 1
        } catch {
          // пропускаем сбойный источник, остальные синхронизируем
        }
      }
      return { total: sources.length, synced, filesFound, deleted }
    },
    onSuccess: (_r, workspaceId) => {
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.workspaceSourceUpdates(workspaceId),
      })
      invalidateAll()
    },
    onError: () => toast.error('Не удалось обновить источники'),
  })
}

/** Список источников проекта (наборные + отдельные). */
export function useDocumentSourcesQuery(projectId: string | undefined) {
  return useQuery({
    queryKey: googleDriveKeys.documentSources(projectId ?? ''),
    queryFn: () => getDocumentSourcesByProject(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME.MEDIUM,
  })
}

function useInvalidateDocumentSources() {
  const queryClient = useQueryClient()
  return useCallback(
    (projectId: string) =>
      queryClient.invalidateQueries({
        queryKey: googleDriveKeys.documentSources(projectId),
      }),
    [queryClient],
  )
}

/**
 * Добавить отдельный источник (папку Drive) в проект по ссылке и синхронизировать
 * его файлы.
 */
export function useAddDocumentSourceMutation() {
  const invalidateAll = useInvalidateAllSourceViews()
  const invalidateSources = useInvalidateDocumentSources()
  return useMutation({
    mutationFn: async ({
      projectId,
      workspaceId,
      link,
      name,
    }: {
      projectId: string
      workspaceId: string
      link: string
      name?: string | null
    }) => {
      const folderId = extractGoogleDriveFolderId(link)
      if (!folderId) throw new Error('Некорректная ссылка на папку Google Drive')
      await ensureDocumentSource({
        projectId,
        workspaceId,
        driveFolderId: folderId,
        documentKitId: null,
        name: name?.trim() || null,
      })
      return syncSourceDocumentsFromDrive({
        projectId,
        workspaceId,
        sourceFolderId: folderId,
        documentKitId: null,
        sourceName: name?.trim() || null,
      })
    },
    onSuccess: (_r, v) => {
      invalidateSources(v.projectId)
      invalidateAll()
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить источник'),
  })
}

/** Удалить источник проекта вместе с его файлами-зеркалом. */
export function useDeleteDocumentSourceMutation() {
  const invalidateAll = useInvalidateAllSourceViews()
  const invalidateSources = useInvalidateDocumentSources()
  return useMutation({
    mutationFn: ({ sourceId }: { sourceId: string; projectId: string }) =>
      deleteDocumentSource(sourceId),
    onSuccess: (_r, v) => {
      invalidateSources(v.projectId)
      invalidateAll()
    },
    onError: () => toast.error('Не удалось удалить источник'),
  })
}
