"use client"

/**
 * CRUD-хуки для item_lists — отдельных списков тредов и проектов.
 *
 * Сетевая часть тонкая: SELECT/INSERT/UPDATE/DELETE по таблице item_lists.
 * Права доступа резолвит RLS, фронт не дублирует проверки.
 *
 * RLS-сводка (см. supabase/migrations/20260510_item_lists.sql):
 *   - SELECT — участник воркспейса видит общие (owner_user_id IS NULL) +
 *     свои личные.
 *   - INSERT/UPDATE/DELETE общих — владелец воркспейса или менеджер с
 *     manage_workspace_settings.
 *   - INSERT/UPDATE/DELETE личных — только сам владелец списка.
 *   - is_deleted=true списки скрываются на уровне SELECT в хуках (а не RLS),
 *     чтобы корзина была доступна владельцу.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { itemListKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { FilterGroup, SortDir, SortField } from '@/lib/filters/types'
import type { Json } from '@/types/database'

export type ItemListEntityType = 'thread' | 'project'

/** Конфиг одной колонки таблицы списка. */
export interface ItemListColumnConfig {
  key: string
  width: number
  order: number
  visible: boolean
}

export interface ItemList {
  id: string
  workspace_id: string
  owner_user_id: string | null
  entity_type: ItemListEntityType
  name: string
  icon: string | null
  color: string | null
  filter_config: FilterGroup
  sort_by: SortField | null
  sort_dir: SortDir | null
  columns: ItemListColumnConfig[]
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
  deleted_at: string | null
  deleted_by: string | null
}

interface CreateItemListParams {
  workspace_id: string
  entity_type: ItemListEntityType
  name: string
  /** undefined → общий список воркспейса. */
  owner_user_id?: string | null
  icon?: string | null
  color?: string | null
  filter_config?: FilterGroup
  sort_by?: SortField | null
  sort_dir?: SortDir | null
  columns?: ItemListColumnConfig[]
}

type RawItemListRow = Omit<ItemList, 'filter_config' | 'columns'> & {
  filter_config: unknown
  columns: unknown
}

function fromRow(row: RawItemListRow): ItemList {
  return {
    ...row,
    filter_config: (row.filter_config as FilterGroup) ?? { logic: 'and', rules: [] },
    columns: Array.isArray(row.columns) ? (row.columns as ItemListColumnConfig[]) : [],
  }
}

// ── Хуки запросов ─────────────────────────────────────────

export function useItemLists(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? itemListKeys.byWorkspace(workspaceId) : ['item-lists', 'noop'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<ItemList[]> => {
      const { data, error } = await supabase
        .from('item_lists')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => fromRow(r as unknown as RawItemListRow))
    },
  })
}

export function useItemList(listId: string | undefined) {
  return useQuery({
    queryKey: listId ? itemListKeys.detail(listId) : ['item-lists', 'detail', 'noop'],
    enabled: !!listId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: async (): Promise<ItemList | null> => {
      const { data, error } = await supabase
        .from('item_lists')
        .select('*')
        .eq('id', listId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return fromRow(data as unknown as RawItemListRow)
    },
  })
}

// ── Мутации ───────────────────────────────────────────────

export function useCreateItemList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateItemListParams): Promise<ItemList> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const userId = userRes.user?.id
      if (!userId) throw new Error('Нет авторизованного пользователя')

      const insertPayload = {
        workspace_id: params.workspace_id,
        owner_user_id: params.owner_user_id ?? null,
        entity_type: params.entity_type,
        name: params.name.trim(),
        icon: params.icon ?? null,
        color: params.color ?? null,
        filter_config: (params.filter_config ?? { logic: 'and', rules: [] }) as unknown as Json,
        sort_by: params.sort_by ?? null,
        sort_dir: params.sort_dir ?? null,
        columns: (params.columns ?? []) as unknown as Json,
        created_by: userId,
      }

      const { data, error } = await supabase
        .from('item_lists')
        .insert(insertPayload)
        .select()
        .single()
      if (error) throw error
      return fromRow(data as unknown as RawItemListRow)
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: itemListKeys.byWorkspace(created.workspace_id) })
    },
  })
}

interface UpdateItemListParams {
  id: string
  workspace_id: string
  name?: string
  icon?: string | null
  color?: string | null
  filter_config?: FilterGroup
  sort_by?: SortField | null
  sort_dir?: SortDir | null
  columns?: ItemListColumnConfig[]
}

export function useUpdateItemList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: UpdateItemListParams): Promise<ItemList> => {
      const { id, workspace_id, ...rest } = params
      void workspace_id
      const update: Record<string, unknown> = {}
      if (rest.name !== undefined) update.name = rest.name.trim()
      if (rest.icon !== undefined) update.icon = rest.icon
      if (rest.color !== undefined) update.color = rest.color
      if (rest.filter_config !== undefined) update.filter_config = rest.filter_config
      if (rest.sort_by !== undefined) update.sort_by = rest.sort_by
      if (rest.sort_dir !== undefined) update.sort_dir = rest.sort_dir
      if (rest.columns !== undefined) update.columns = rest.columns

      const { data, error } = await supabase
        .from('item_lists')
        .update(update as never)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return fromRow(data as unknown as RawItemListRow)
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: itemListKeys.byWorkspace(updated.workspace_id) })
      qc.invalidateQueries({ queryKey: itemListKeys.detail(updated.id) })
    },
  })
}

export function useSoftDeleteItemList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; workspace_id: string }): Promise<void> => {
      const { data: userRes } = await supabase.auth.getUser()
      const userId = userRes.user?.id ?? null
      const { error } = await supabase
        .from('item_lists')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: itemListKeys.byWorkspace(vars.workspace_id) })
      qc.invalidateQueries({ queryKey: itemListKeys.detail(vars.id) })
    },
  })
}
