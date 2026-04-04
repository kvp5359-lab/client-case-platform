/**
 * Хук для загрузки данных шаблона набора документов
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DocumentKitTemplate, FolderTemplate, KitFolder } from './types'

// Загрузка шаблона набора документов
export function useDocumentKitTemplate(kitId: string | undefined) {
  return useQuery({
    queryKey: ['document-kit-template', kitId],
    queryFn: async () => {
      if (!kitId) return null

      const { data, error } = await supabase
        .from('document_kit_templates')
        .select('*')
        .eq('id', kitId)
        .single()

      if (error) throw error
      return data as DocumentKitTemplate
    },
    enabled: !!kitId,
  })
}

// Загрузка папок набора
export function useKitFolders(kitId: string | undefined) {
  return useQuery({
    queryKey: ['kit-folders', kitId],
    queryFn: async () => {
      if (!kitId) return []

      const { data: folders, error } = await supabase
        .from('document_kit_template_folders')
        .select('*')
        .eq('kit_template_id', kitId)
        .order('order_index', { ascending: true })

      if (error) throw error
      return (folders || []) as KitFolder[]
    },
    enabled: !!kitId,
  })
}

// Загрузка всех слотов для папок набора (одним запросом)
export function useKitFolderSlots(kitFolderIds: string[]) {
  return useQuery({
    queryKey: ['kit-folder-slots-all', ...kitFolderIds],
    queryFn: async () => {
      if (kitFolderIds.length === 0) return {}

      const { data, error } = await supabase
        .from('document_kit_template_folder_slots')
        .select('id, kit_folder_id, name, sort_order')
        .in('kit_folder_id', kitFolderIds)
        .order('sort_order')

      if (error) throw error

      const grouped: Record<string, { id: string; name: string; sort_order: number }[]> = {}
      for (const slot of data || []) {
        if (!grouped[slot.kit_folder_id]) grouped[slot.kit_folder_id] = []
        grouped[slot.kit_folder_id].push(slot)
      }
      return grouped
    },
    enabled: kitFolderIds.length > 0,
  })
}

// Загрузка доступных шаблонов папок
export function useAvailableFolderTemplates(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['folder-templates', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []

      const { data, error } = await supabase
        .from('folder_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })

      if (error) throw error
      return data as FolderTemplate[]
    },
    enabled: !!workspaceId && enabled,
  })
}
