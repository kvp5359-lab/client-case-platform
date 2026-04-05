/**
 * Общая утилита для скачивания документов в ZIP-архив
 * Используется как из пакетных действий, так и при скачивании набора целиком
 */

import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { downloadDocumentBlob } from './documentService'
import { downloadBlob } from '@/utils/downloadBlob'

export type DownloadGroupMode = 'folders' | 'flat'

interface DocumentForDownload {
  id: string
  name: string
  folder_id: string | null
  document_files?: Array<{
    is_current: boolean | null
    file_path: string
    file_id?: string | null
    file_name: string
    file_size?: number
  }>
}

interface FolderForDownload {
  id: string
  name: string
}

export interface DownloadDocumentsOptions {
  docs: DocumentForDownload[]
  folders: FolderForDownload[]
  archiveName: string
  mode: DownloadGroupMode
}

export async function downloadDocumentsAsZip({
  docs,
  folders,
  archiveName,
  mode,
}: DownloadDocumentsOptions): Promise<void> {
  // Lazy-load jszip — модуль ~100 KB, загружаем только при скачивании архива,
  // а не при загрузке страницы документов.
  const { default: JSZip } = await import('jszip')
  const folderMap = new Map(folders.map((f) => [f.id, f]))
  const zip = new JSZip()
  let successCount = 0
  const errors: string[] = []

  for (const doc of docs) {
    try {
      const currentFile = doc.document_files?.find((f) => f.is_current) || doc.document_files?.[0]
      if (!currentFile) {
        errors.push(`${doc.name}: файл не найден`)
        continue
      }

      const fileData = await downloadDocumentBlob(currentFile.file_path, currentFile.file_id)
      let archivePath: string

      if (mode === 'folders' && doc.folder_id) {
        const folder = folderMap.get(doc.folder_id)
        const folderName = (folder?.name || 'Без названия').replace(/[<>:"/\\|?*]/g, '_')
        archivePath = `${folderName}/${currentFile.file_name}`
      } else {
        archivePath = currentFile.file_name
      }

      zip.file(archivePath, await fileData.arrayBuffer())
      successCount++
    } catch (error) {
      errors.push(`${doc.name}: ${error instanceof Error ? error.message : 'Ошибка'}`)
    }
  }

  if (successCount === 0) {
    throw new Error('Не удалось скачать ни одного документа')
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const safeName = archiveName.replace(/[<>:"/\\|?*]/g, '_')
  downloadBlob(zipBlob, `${safeName}_${new Date().toISOString().split('T')[0]}.zip`)

  if (errors.length > 0) {
    logger.error('Частичные ошибки при скачивании:', errors)
    toast.warning(`Скачано ${successCount} из ${docs.length}`)
  } else {
    toast.success(`Скачано документов: ${successCount}`)
  }
}
