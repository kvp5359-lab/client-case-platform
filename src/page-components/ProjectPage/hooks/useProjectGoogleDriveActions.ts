"use client"

/**
 * Хук-обёртка с handler'ами для Google Drive в ProjectPage.
 * Выделен из ProjectPage.tsx (3 похожих async handler'а с toast/logger).
 */

import { useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { UseMutationResult } from '@tanstack/react-query'

interface UseProjectGoogleDriveActionsParams {
  workspaceId: string | undefined
  rootFolderId: string | null | undefined
  updateProjectGoogleDrive: UseMutationResult<unknown, Error, string | null>
  closeDialog: () => void
  folderLink: string
}

export function useProjectGoogleDriveActions({
  workspaceId,
  rootFolderId,
  updateProjectGoogleDrive,
  closeDialog,
  folderLink,
}: UseProjectGoogleDriveActionsParams) {
  const handleSaveGoogleDriveLink = useCallback(async () => {
    try {
      await updateProjectGoogleDrive.mutateAsync(folderLink || null)
      closeDialog()
      toast.success('Папка Google Drive подключена')
    } catch (error) {
      logger.error('Ошибка подключения Google Drive:', error)
      toast.error('Не удалось сохранить ссылку Google Drive', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }, [updateProjectGoogleDrive, folderLink, closeDialog])

  const handleDisconnectGoogleDrive = useCallback(async () => {
    try {
      await updateProjectGoogleDrive.mutateAsync(null)
      toast.success('Папка Google Drive отключена')
    } catch (error) {
      logger.error('Ошибка отключения Google Drive:', error)
      toast.error('Не удалось отключить Google Drive', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }, [updateProjectGoogleDrive])

  const handleCreateGoogleDriveFolder = useCallback(
    async (folderName: string) => {
      try {
        if (!rootFolderId) {
          toast.error('Корневая папка не настроена в типе проекта')
          return
        }

        const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
          body: { workspaceId, parentFolderId: rootFolderId, folderName },
        })

        if (error) throw error
        if (data?.error) {
          if (data.error === 'Google Drive not connected') {
            toast.error('Google Drive не подключён')
          } else {
            toast.error(data.error)
          }
          return
        }

        if (data?.folderLink) {
          await updateProjectGoogleDrive.mutateAsync(data.folderLink)
          closeDialog()
          toast.success('Папка создана и подключена')
        }
      } catch (error) {
        logger.error('Ошибка создания папки Google Drive:', error)
        toast.error('Не удалось создать папку')
      }
    },
    [rootFolderId, workspaceId, updateProjectGoogleDrive, closeDialog],
  )

  return {
    handleSaveGoogleDriveLink,
    handleDisconnectGoogleDrive,
    handleCreateGoogleDriveFolder,
  }
}
