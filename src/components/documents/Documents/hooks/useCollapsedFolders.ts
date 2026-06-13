"use client"

/**
 * Управление состоянием свёрнутых папок с persist в localStorage
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { DocumentKitWithDocuments } from '@/components/documents/types'

export function useCollapsedFolders(
  projectId: string,
  documentKits: { id: string; folders?: { id: string }[] }[],
) {
  const storageKey = `cardview-collapsed-${projectId}`
  const kitsStorageKey = `cardview-collapsed-kits-${projectId}`

  /** Папки сгруппированные по kit ID */
  const folderIdsByKit = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const kit of documentKits) {
      const folders = (kit as DocumentKitWithDocuments).folders || []
      map.set(
        kit.id,
        folders.map((f) => f.id),
      )
    }
    return map
  }, [documentKits])

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return new Set()
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? new Set<string>(parsed) : new Set<string>()
    } catch {
      return new Set()
    }
  })

  /** Свёрнутые наборы (kit ID) */
  const [collapsedKits, setCollapsedKits] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(kitsStorageKey)
      if (!saved) return new Set()
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? new Set<string>(parsed) : new Set<string>()
    } catch {
      return new Set()
    }
  })

  // Синхронизация в localStorage — вне setState
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify([...collapsedFolders]))
  }, [storageKey, collapsedFolders])

  useEffect(() => {
    localStorage.setItem(kitsStorageKey, JSON.stringify([...collapsedKits]))
  }, [kitsStorageKey, collapsedKits])

  const handleToggleCollapse = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const collapseAllForKit = useCallback(
    (kitId: string) => {
      const kitFolderIds = folderIdsByKit.get(kitId) || []
      setCollapsedFolders((prev) => {
        const next = new Set(prev)
        for (const id of kitFolderIds) {
          next.add(id)
        }
        return next
      })
    },
    [folderIdsByKit],
  )

  const expandAllForKit = useCallback(
    (kitId: string) => {
      const kitFolderIds = folderIdsByKit.get(kitId) || []
      setCollapsedFolders((prev) => {
        const next = new Set(prev)
        for (const id of kitFolderIds) {
          next.delete(id)
        }
        return next
      })
    },
    [folderIdsByKit],
  )

  const isAllCollapsedForKit = useCallback(
    (kitId: string) => {
      const kitFolderIds = folderIdsByKit.get(kitId) || []
      return kitFolderIds.length > 0 && kitFolderIds.every((id) => collapsedFolders.has(id))
    },
    [folderIdsByKit, collapsedFolders],
  )

  const handleToggleKit = useCallback((kitId: string) => {
    setCollapsedKits((prev) => {
      const next = new Set(prev)
      if (next.has(kitId)) {
        next.delete(kitId)
      } else {
        next.add(kitId)
      }
      return next
    })
  }, [])

  return {
    collapsedFolders,
    collapsedKits,
    handleToggleCollapse,
    handleToggleKit,
    collapseAllForKit,
    expandAllForKit,
    isAllCollapsedForKit,
  }
}
