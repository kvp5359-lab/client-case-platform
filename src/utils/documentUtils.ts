import type { Tables } from '@/types/database'

type DocumentFile = Tables<'document_files'>

/**
 * Возвращает текущую версию файла документа.
 * Ищет файл с is_current === true, иначе берёт первый из массива.
 */
export function getCurrentDocumentFile(
  document_files: DocumentFile[] | undefined | null,
): DocumentFile | undefined {
  if (!document_files || document_files.length === 0) return undefined
  return document_files.find((f) => f.is_current) ?? document_files[0]
}
