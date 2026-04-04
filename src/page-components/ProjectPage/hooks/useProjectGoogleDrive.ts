"use client"

/**
 * Хук для работы с Google Drive интеграцией проекта
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import type { Project } from '@/types/entities'

export function useProjectGoogleDrive(
  project: Project | null | undefined,
  enabled = true,
  workspaceId?: string,
) {
  const [googleDriveFolderName, setGoogleDriveFolderName] = useState<string | null>(null)
  const [isLoadingFolderName, setIsLoadingFolderName] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [folderLink, setFolderLink] = useState('')

  // Загружаем название папки с защитой от race condition
  /* eslint-disable react-hooks/set-state-in-effect -- async effect with isCurrent guard */
  useEffect(() => {
    let isCurrent = true
    if (enabled && project?.google_drive_folder_link) {
      const url = project.google_drive_folder_link
      const folderId = extractGoogleDriveFolderId(url)
      if (!folderId) {
        setGoogleDriveFolderName(null)
        return
      }
      setIsLoadingFolderName(true)
      supabase.functions
        .invoke('google-drive-get-folder-name', { body: { folderId, workspaceId } })
        .then(({ data, error }) => {
          if (!isCurrent) return
          setGoogleDriveFolderName(
            !error && data?.name ? data.name : '(не удалось получить название)',
          )
        })
        .catch(() => {
          if (isCurrent) setGoogleDriveFolderName('(ошибка загрузки)')
        })
        .finally(() => {
          if (isCurrent) setIsLoadingFolderName(false)
        })
    } else {
      setGoogleDriveFolderName(null)
    }
    return () => {
      isCurrent = false
    }
  }, [enabled, project?.google_drive_folder_link, workspaceId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Открытие диалога
  const openDialog = useCallback(() => {
    setFolderLink(project?.google_drive_folder_link || '')
    setDialogOpen(true)
  }, [project?.google_drive_folder_link])

  // Закрытие диалога
  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setFolderLink('')
  }, [])

  return {
    googleDriveFolderName,
    isLoadingFolderName,
    dialogOpen,
    folderLink,
    setFolderLink,
    openDialog,
    closeDialog,
  }
}
