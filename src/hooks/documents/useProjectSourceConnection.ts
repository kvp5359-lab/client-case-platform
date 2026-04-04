import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'

interface UseProjectSourceConnectionProps {
  projectId: string
  onSuccess?: () => void
}

/**
 * Хук для подключения и настройки источника/назначения на уровне проекта
 */
export function useProjectSourceConnection({
  projectId,
  onSuccess,
}: UseProjectSourceConnectionProps) {
  const connectSource = async (
    sourceFolderLink: string,
    callbacks: {
      closeDialog: () => void
      setSourceFolderLink: (link: string) => void
      setSourceConnected: (connected: boolean) => void
    },
  ): Promise<boolean> => {
    const folderId = extractGoogleDriveFolderId(sourceFolderLink)

    if (!folderId) {
      toast.error('Некорректная ссылка на папку')
      return false
    }

    try {
      const { error } = await supabase
        .from('projects')
        .update({ source_folder_id: folderId })
        .eq('id', projectId)

      if (error) throw error

      callbacks.closeDialog()
      callbacks.setSourceFolderLink('')
      callbacks.setSourceConnected(true)
      toast.success('Источник успешно подключён!')
      onSuccess?.()
      return true
    } catch (error) {
      logger.error('Ошибка при подключении источника Google Drive:', error)
      toast.error('Ошибка при подключении источника')
      return false
    }
  }

  const saveSourceSettings = async (
    sourceFolderLink: string,
    callbacks: {
      closeDialog: () => void
      setSourceConnected: (connected: boolean) => void
    },
  ): Promise<boolean> => {
    const folderId = extractGoogleDriveFolderId(sourceFolderLink)

    if (!folderId) {
      toast.error('Некорректная ссылка на папку')
      return false
    }

    try {
      const { error } = await supabase
        .from('projects')
        .update({ source_folder_id: folderId })
        .eq('id', projectId)

      if (error) throw error

      callbacks.closeDialog()
      callbacks.setSourceConnected(true)
      toast.success('Настройки источника сохранены!')
      onSuccess?.()
      return true
    } catch (error) {
      logger.error('Ошибка при сохранении настроек источника:', error)
      toast.error('Ошибка при сохранении настроек')
      return false
    }
  }

  const disconnectSource = async (callbacks: {
    setSourceConnected: (connected: boolean) => void
  }): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ source_folder_id: null })
        .eq('id', projectId)

      if (error) throw error

      callbacks.setSourceConnected(false)
      toast.success('Источник отключён')
      onSuccess?.()
      return true
    } catch (error) {
      logger.error('Ошибка при отключении источника Google Drive:', error)
      toast.error('Ошибка при отключении источника')
      return false
    }
  }

  const saveExportSettings = async (
    exportFolderLink: string,
    callbacks: {
      closeDialog: () => void
      setExportFolderConnected: (connected: boolean) => void
    },
  ): Promise<boolean> => {
    const folderId = extractGoogleDriveFolderId(exportFolderLink)

    if (!folderId) {
      toast.error('Некорректная ссылка на папку')
      return false
    }

    try {
      const { error } = await supabase
        .from('projects')
        .update({ export_folder_id: folderId })
        .eq('id', projectId)

      if (error) throw error
      callbacks.closeDialog()
      callbacks.setExportFolderConnected(true)
      toast.success('Целевая папка для выгрузки сохранена!')
      onSuccess?.()
      return true
    } catch (error) {
      logger.error('Ошибка при сохранении целевой папки для экспорта:', error)
      toast.error('Ошибка при сохранении целевой папки')
      return false
    }
  }

  return {
    connectSource,
    saveSourceSettings,
    disconnectSource,
    saveExportSettings,
    extractFolderId: extractGoogleDriveFolderId,
  }
}
