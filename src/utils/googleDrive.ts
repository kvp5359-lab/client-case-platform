/**
 * Утилиты для работы с Google Drive
 * Устраняет дублирование логики парсинга ссылок
 */

/**
 * Извлекает ID папки из URL Google Drive
 * Поддерживает форматы:
 * - /drive/folders/FOLDER_ID
 * - ?id=FOLDER_ID
 * - Прямой ID
 */
export function extractGoogleDriveFolderId(url: string): string | null {
  if (!url || !url.trim()) return null

  url = url.trim()

  // Прямой ID (только буквы, цифры, дефисы и подчёркивания)
  if (/^[a-zA-Z0-9_-]+$/.test(url)) {
    return url
  }

  // Формат: /drive/folders/FOLDER_ID
  const foldersMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (foldersMatch) {
    return foldersMatch[1]
  }

  // Формат: /open?id=FOLDER_ID или ?id=FOLDER_ID
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openMatch) {
    return openMatch[1]
  }

  return null
}

/**
 * Формирует URL для открытия папки в Google Drive
 */
export function buildGoogleDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`
}

/**
 * Извлекает ID таблицы из URL Google Sheets
 * Поддерживает форматы:
 * - /spreadsheets/d/SPREADSHEET_ID/edit
 * - /spreadsheets/d/SPREADSHEET_ID
 * - Прямой ID
 */
export function extractGoogleSheetsId(url: string): string | null {
  if (!url || !url.trim()) return null

  url = url.trim()

  // Прямой ID (только буквы, цифры, дефисы и подчёркивания)
  if (/^[a-zA-Z0-9_-]+$/.test(url)) {
    return url
  }

  // Формат: /spreadsheets/d/SPREADSHEET_ID
  const sheetsMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheetsMatch) {
    return sheetsMatch[1]
  }

  return null
}
