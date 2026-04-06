/**
 * Скачивает Blob как файл через браузерный механизм (createElement('a') + createObjectURL).
 * Единая точка для всех случаев скачивания blob-ов в проекте.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
