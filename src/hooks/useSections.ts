"use client"

/**
 * Разделы (workspace_sections) — группировка досок и списков в именованные
 * разделы воркспейса (м-к-м через workspace_section_items).
 *
 * Раздел общий для команды: видят все участники, создают/меняют — владелец или
 * менеджер с manage_workspace_settings (гейтит RLS, фронт не дублирует).
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sectionKeys, STALE_TIME } from '@/hooks/queryKeys'

export type WorkspaceSection = {
  id: string
  workspace_id: string
  name: string
  icon: string | null
  color: string | null
  order_index: number
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
}

export type SectionItemType = 'board' | 'list'

export type SectionItem = {
  section_id: string
  item_type: SectionItemType
  item_id: string
  order_index: number
}

// ── Запросы ───────────────────────────────────────────────

export function useSections(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? sectionKeys.byWorkspace(workspaceId) : ['sections', 'noop'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<WorkspaceSection[]> => {
      const { data, error } = await supabase
        .from('workspace_sections')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WorkspaceSection[]
    },
  })
}

/** Все членства воркспейса. Джойн на sections для фильтра по workspace_id. */
export function useSectionItems(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? sectionKeys.items(workspaceId) : ['section-items', 'noop'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<SectionItem[]> => {
      const { data, error } = await supabase
        .from('workspace_section_items')
        .select('section_id, item_type, item_id, order_index, workspace_sections!inner(workspace_id)')
        .eq('workspace_sections.workspace_id', workspaceId!)
        .order('order_index', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => ({
        section_id: r.section_id,
        item_type: r.item_type as SectionItemType,
        item_id: r.item_id,
        order_index: r.order_index,
      }))
    },
  })
}

/** Производные карты: section_id → members, и itemKey → section_ids. */
export function useSectionMaps(workspaceId: string | undefined) {
  const { data: items = [], ...rest } = useSectionItems(workspaceId)
  const maps = useMemo(() => {
    const bySection = new Map<string, SectionItem[]>()
    const byItem = new Map<string, string[]>() // `${type}:${id}` → section_ids
    for (const it of items) {
      if (!bySection.has(it.section_id)) bySection.set(it.section_id, [])
      bySection.get(it.section_id)!.push(it)
      const key = `${it.item_type}:${it.item_id}`
      if (!byItem.has(key)) byItem.set(key, [])
      byItem.get(key)!.push(it.section_id)
    }
    return { bySection, byItem }
  }, [items])
  return { ...maps, ...rest }
}

// ── Мутации ───────────────────────────────────────────────

export function useCreateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { workspace_id: string; name: string; icon?: string | null; color?: string | null }) => {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes.user?.id
      if (!userId) throw new Error('Нет авторизованного пользователя')
      const { data, error } = await supabase
        .from('workspace_sections')
        .insert({
          workspace_id: params.workspace_id,
          name: params.name.trim(),
          icon: params.icon ?? null,
          color: params.color ?? null,
          created_by: userId,
        })
        .select()
        .single()
      if (error) throw error
      return data as WorkspaceSection
    },
    onSuccess: (s) => qc.invalidateQueries({ queryKey: sectionKeys.byWorkspace(s.workspace_id) }),
  })
}

/** Добавить/убрать доску или список в разделе (toggle membership). */
export function useToggleSectionItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      workspace_id: string
      section_id: string
      item_type: SectionItemType
      item_id: string
      present: boolean
    }) => {
      if (params.present) {
        const { error } = await supabase
          .from('workspace_section_items')
          .delete()
          .eq('section_id', params.section_id)
          .eq('item_type', params.item_type)
          .eq('item_id', params.item_id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workspace_section_items').insert({
          section_id: params.section_id,
          item_type: params.item_type,
          item_id: params.item_id,
        })
        if (error) throw error
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: sectionKeys.items(v.workspace_id) }),
  })
}
