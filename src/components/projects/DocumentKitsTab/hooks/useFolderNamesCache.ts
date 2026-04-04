"use client"

/**
 * Хук для кеширования и загрузки названий папок Google Drive.
 * Side-effect хук — ничего не возвращает.
 */

import { useEffect, useRef } from 'react'

interface UseFolderNamesCacheParams {
  sourceFolderId: string | null | undefined
  exportFolderId: string | null | undefined
  setSourceConnected: (v: boolean) => void
  setSourceFolderName: (v: string) => void
  setExportFolderConnected: (v: boolean) => void
  setExportFolderName: (v: string) => void
  getFolderName: (folderId: string) => Promise<string | null>
}

export function useFolderNamesCache({
  sourceFolderId,
  exportFolderId,
  setSourceConnected,
  setSourceFolderName,
  setExportFolderConnected,
  setExportFolderName,
  getFolderName,
}: UseFolderNamesCacheParams): void {
  const folderNamesCache = useRef<Map<string, string>>(new Map())
  const loadingFolders = useRef<Set<string>>(new Set())

  // Ref для актуальных callbacks — избегаем нестабильных зависимостей в useEffect
  const callbacksRef = useRef({
    setSourceConnected,
    setSourceFolderName,
    setExportFolderConnected,
    setExportFolderName,
    getFolderName,
  })
  useEffect(() => {
    callbacksRef.current = {
      setSourceConnected,
      setSourceFolderName,
      setExportFolderConnected,
      setExportFolderName,
      getFolderName,
    }
  })

  useEffect(() => {
    let cancelled = false

    const loadFolderNames = async () => {
      const cb = callbacksRef.current

      // Загрузка названия папки-источника
      if (sourceFolderId) {
        cb.setSourceConnected(true)

        const cachedName = folderNamesCache.current.get(sourceFolderId)
        if (cachedName) {
          if (!cancelled) cb.setSourceFolderName(cachedName)
        } else if (!loadingFolders.current.has(sourceFolderId)) {
          loadingFolders.current.add(sourceFolderId)

          const sourceName = await cb.getFolderName(sourceFolderId)
          if (!cancelled && sourceName) {
            folderNamesCache.current.set(sourceFolderId, sourceName)
            cb.setSourceFolderName(sourceName)
          }
          loadingFolders.current.delete(sourceFolderId)
        }
      } else {
        if (!cancelled) {
          cb.setSourceConnected(false)
          cb.setSourceFolderName('')
        }
      }

      if (cancelled) return

      // Загрузка названия целевой папки
      if (exportFolderId) {
        cb.setExportFolderConnected(true)

        const cachedName = folderNamesCache.current.get(exportFolderId)
        if (cachedName) {
          if (!cancelled) cb.setExportFolderName(cachedName)
        } else if (!loadingFolders.current.has(exportFolderId)) {
          loadingFolders.current.add(exportFolderId)

          const exportName = await cb.getFolderName(exportFolderId)
          if (!cancelled && exportName) {
            folderNamesCache.current.set(exportFolderId, exportName)
            cb.setExportFolderName(exportName)
          }
          loadingFolders.current.delete(exportFolderId)
        }
      } else {
        if (!cancelled) {
          cb.setExportFolderConnected(false)
          cb.setExportFolderName('')
        }
      }
    }

    loadFolderNames()
    return () => {
      cancelled = true
    }
  }, [sourceFolderId, exportFolderId])
}
