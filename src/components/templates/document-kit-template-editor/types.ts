/**
 * Типы для редактора шаблона набора документов
 */

import { Database } from '@/types/database'

export type DocumentKitTemplate = Database['public']['Tables']['document_kit_templates']['Row']
export type FolderTemplate = Database['public']['Tables']['folder_templates']['Row']
export type KitFolder = Database['public']['Tables']['document_kit_template_folders']['Row']
