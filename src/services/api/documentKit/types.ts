/**
 * Типы для Document Kit сервиса
 */

import { Tables } from '@/types/database'
import type { DocumentWithFiles } from '../../documents/types'

export type DocumentKit = Tables<'document_kits'>
export type DocumentKitInsert = Omit<DocumentKit, 'id' | 'created_at' | 'updated_at'>
export type DocumentKitUpdate = Partial<DocumentKitInsert>

type Folder = Tables<'folders'>

export interface DocumentKitWithDocuments extends DocumentKit {
  documents?: DocumentWithFiles[]
  folders?: Folder[]
}
