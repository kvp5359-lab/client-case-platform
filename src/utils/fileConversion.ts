/**
 * Утилиты конвертации файлов: base64 ↔ Blob ↔ File.
 * Единый источник для всех сервисов.
 */

/** Конвертация File → base64 строка (без data:...;base64, префикса) */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Не удалось извлечь base64 из файла'))
        return
      }
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Конвертация base64 → Blob */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const CHUNK_SIZE = 512
  const byteArrays: Uint8Array[] = []

  for (let offset = 0; offset < byteCharacters.length; offset += CHUNK_SIZE) {
    const slice = byteCharacters.slice(offset, offset + CHUNK_SIZE)
    const byteNumbers = new Array(slice.length)
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }
    byteArrays.push(new Uint8Array(byteNumbers))
  }

  // Cast to BlobPart[]: TS 5.7+ narrowed Uint8Array generic; Blob ctor
  // accepts it at runtime. Safe because Uint8Array implements ArrayBufferView.
  return new Blob(byteArrays as BlobPart[], { type: mimeType })
}

/** Конвертация base64 → File */
export function base64ToFile(base64: string, fileName: string, mimeType = 'application/pdf'): File {
  const blob = base64ToBlob(base64, mimeType)
  return new File([blob], fileName, { type: mimeType })
}
