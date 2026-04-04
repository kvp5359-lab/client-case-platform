"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DocumentForAi } from '@/services/api/messengerAiService'

/**
 * Load project documents for AI context
 */
export async function fetchDocumentsForAi(projectId: string): Promise<DocumentForAi[]> {
  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, text_content, document_kit_id, folder_id, sort_order, status')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .not('text_content', 'is', null)
    .order('sort_order', { ascending: true })

  if (!docs || docs.length === 0) return []

  const kitIds = [...new Set(docs.map((d) => d.document_kit_id))]
  const folderIds = [...new Set(docs.map((d) => d.folder_id).filter(Boolean))] as string[]

  const [{ data: kits }, { data: folders }] = await Promise.all([
    supabase.from('document_kits').select('id, name').in('id', kitIds),
    folderIds.length > 0
      ? supabase.from('folders').select('id, name, sort_order').in('id', folderIds)
      : Promise.resolve({ data: [] as { id: string; name: string; sort_order: number | null }[] }),
  ])

  const kitMap = new Map((kits ?? []).map((k) => [k.id, k.name]))
  const folderMap = new Map(
    (folders ?? []).map((f) => [f.id, { name: f.name, sortOrder: f.sort_order }]),
  )

  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    textContent: d.text_content,
    kitName: kitMap.get(d.document_kit_id) ?? null,
    folderName: d.folder_id ? (folderMap.get(d.folder_id)?.name ?? null) : null,
    folderSortOrder: d.folder_id ? (folderMap.get(d.folder_id)?.sortOrder ?? null) : null,
    sortOrder: d.sort_order ?? 0,
    statusId: d.status ?? null,
  }))
}

export function useDocumentsForAi(projectId: string) {
  return useQuery({
    queryKey: ['messenger-ai', 'documents', projectId],
    queryFn: () => fetchDocumentsForAi(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}
