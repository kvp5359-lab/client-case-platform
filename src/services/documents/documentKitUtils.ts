import type { DocumentKitWithDocuments } from '@/services/api/documentKitService'

/**
 * Определяет document_kit_id по папке назначения.
 * Если папка принадлежит другому набору — возвращает ID того набора.
 * @param folderId - ID папки назначения (null для корня)
 * @param allKits - все наборы документов
 * @param fallbackKitId - ID набора по умолчанию (если папка не найдена)
 */
export function getKitIdForFolder(
  folderId: string | null,
  allKits: DocumentKitWithDocuments[],
  fallbackKitId?: string,
): string | undefined {
  if (!folderId) return fallbackKitId ?? allKits[0]?.id
  for (const k of allKits) {
    if (k.folders?.some((f) => f.id === folderId)) return k.id
  }
  return fallbackKitId ?? allKits[0]?.id
}
