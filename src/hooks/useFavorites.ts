"use client"

/**
 * Персональное «Избранное» (таблица user_favorites, RLS «только свои строки»).
 * Любой тред/проект/доска/список добавляется/убирается; данные на пользователя,
 * не на воркспейс. См. supabase/migrations/20260625_user_favorites.sql.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type FavoriteEntityType = 'thread' | 'project' | 'board' | 'list'

export type FavoriteRow = {
  id: string
  entity_type: FavoriteEntityType
  entity_id: string
  sort_order: number
  created_at: string
}

export type FavoriteTarget = { type: FavoriteEntityType; id: string }

const favoritesKey = (workspaceId: string | undefined, userId: string | undefined) =>
  ['user-favorites', workspaceId ?? 'noop', userId ?? 'anon'] as const

export function useFavorites(workspaceId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: favoritesKey(workspaceId, user?.id),
    enabled: !!workspaceId && !!user?.id,
    queryFn: async (): Promise<FavoriteRow[]> => {
      const { data, error } = await supabase
        .from('user_favorites')
        .select('id, entity_type, entity_id, sort_order, created_at')
        .eq('workspace_id', workspaceId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as FavoriteRow[]
    },
  })
}

export function useToggleFavorite(workspaceId: string | undefined) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const key = favoritesKey(workspaceId, user?.id)

  return useMutation({
    mutationFn: async (target: FavoriteTarget): Promise<'added' | 'removed'> => {
      if (!workspaceId || !user?.id) throw new Error('Нет воркспейса или пользователя')
      // Существование определяем по реальной БД, НЕ по кэшу: onMutate уже мог
      // положить туда оптимистичную строку с фейковым id (был баг 22P02).
      const { data: rows, error: selErr } = await supabase
        .from('user_favorites')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', target.type)
        .eq('entity_id', target.id)
        .limit(1)
      if (selErr) throw selErr
      const existingId = rows?.[0]?.id
      if (existingId) {
        const { error } = await supabase.from('user_favorites').delete().eq('id', existingId)
        if (error) throw error
        return 'removed'
      }
      // Новый элемент — в КОНЕЦ своей группы: sort_order = max(группы) + 1.
      const { data: maxRow } = await supabase
        .from('user_favorites')
        .select('sort_order')
        .eq('workspace_id', workspaceId)
        .eq('entity_type', target.type)
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextOrder = (maxRow?.[0]?.sort_order ?? -1) + 1
      const { error } = await supabase.from('user_favorites').insert({
        user_id: user.id,
        workspace_id: workspaceId,
        entity_type: target.type,
        entity_id: target.id,
        sort_order: nextOrder,
      })
      if (error) throw error
      return 'added'
    },
    onMutate: async (target) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FavoriteRow[]>(key) ?? []
      const existing = prev.find((f) => f.entity_type === target.type && f.entity_id === target.id)
      // Новый элемент — в КОНЕЦ (большой sort_order), чтобы оптимистично он
      // сразу оказался внизу своей группы, а не вверху.
      const maxOrder = prev
        .filter((f) => f.entity_type === target.type)
        .reduce((m, f) => Math.max(m, f.sort_order), -1)
      const next = existing
        ? prev.filter((f) => f.id !== existing.id)
        : [
            ...prev,
            {
              id: `optimistic-${target.type}-${target.id}`,
              entity_type: target.type,
              entity_id: target.id,
              sort_order: maxOrder + 1,
              created_at: new Date().toISOString(),
            },
          ]
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      const err = e as { message?: string; code?: string; details?: string; hint?: string }
      const desc =
        e instanceof Error
          ? e.message
          : [err?.message, err?.code && `code=${err.code}`, err?.details, err?.hint]
              .filter(Boolean)
              .join(' · ') || JSON.stringify(e)
      toast.error('Не удалось изменить избранное', { description: desc })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * Переупорядочивание избранного внутри одной группы (типа). Принимает id строк
 * группы в новом порядке → пишет sort_order = index. Оптимистично.
 */
export function useReorderFavorites(workspaceId: string | undefined) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const key = favoritesKey(workspaceId, user?.id)

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from('user_favorites')
            .update({ sort_order: i })
            .eq('id', id)
            .then(({ error }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FavoriteRow[]>(key) ?? []
      const pos = new Map(orderedIds.map((id, i) => [id, i]))
      const next = prev
        .map((r) => (pos.has(r.id) ? { ...r, sort_order: pos.get(r.id)! } : r))
        .sort((a, b) => a.sort_order - b.sort_order)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      toast.error('Не удалось изменить порядок', {
        description: e instanceof Error ? e.message : String(e),
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })
}
