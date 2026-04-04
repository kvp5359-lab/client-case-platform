/**
 * Типы для работы с Google Drive API
 */

export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  webViewLink?: string
  iconLink?: string
  thumbnailLink?: string
  modifiedTime?: string
  createdTime?: string
}
