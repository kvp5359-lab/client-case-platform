"use client"

/**
 * Профили настроек интерфейса (UI: «Профиль настроек»).
 *
 * Профиль — переключаемый контейнер настроек интерфейса воркспейса. Сейчас
 * config = { slots }. Позже в тот же config добавятся quick_actions / custom_menus.
 *
 * Доступ (каркас): профили ОБЩИЕ (owner_user_id = null) — любой участник видит
 * и переключается сам, редактирует владелец воркспейса (RLS). Активный профиль
 * хранится персонально (user_active_preset).
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  GC_TIME,
  STALE_TIME,
  interfacePresetKeys,
  workspaceSidebarSettingsKeys,
} from '@/hooks/queryKeys'
import {
  type SidebarSlot,
  normalizeSidebarSlots,
  DEFAULT_SIDEBAR_SLOTS,
} from '@/lib/sidebarSettings'
import { fromSupabaseJson, toSupabaseJson } from '@/utils/supabaseJson'
import type { QuickAction } from '@/types/quickActions'

/** Структура config профиля. Расширяется по мере роста (custom_menus…). */
export type InterfacePresetConfig = {
  slots?: SidebarSlot[]
  quick_actions?: QuickAction[]
  // custom_menus?: CustomMenu[]     // Фаза кастомных меню
  // default_route?: string
}

export type InterfacePreset = {
  id: string
  workspace_id: string
  name: string
  icon: string | null
  color: string | null
  is_default: boolean
  owner_user_id: string | null
  config: InterfacePresetConfig
  order_index: number
}

const PRESET_COLUMNS =
  'id, workspace_id, name, icon, color, is_default, owner_user_id, config, order_index'

function mapPreset(row: Record<string, unknown>): InterfacePreset {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    name: row.name as string,
    icon: (row.icon as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    is_default: Boolean(row.is_default),
    owner_user_id: (row.owner_user_id as string | null) ?? null,
    // row.config — нетипизированный jsonb из generic-запроса; разбираем через sanctioned-хелпер
    config: fromSupabaseJson<InterfacePresetConfig>(row.config as never) ?? {},
    order_index: Number(row.order_index ?? 0),
  }
}

/** Список общих профилей воркспейса (по порядку). */
export function useInterfacePresets(workspaceId: string | undefined) {
  return useQuery({
    queryKey: interfacePresetKeys.byWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.STANDARD,
    queryFn: async (): Promise<InterfacePreset[]> => {
      const { data, error } = await supabase
        .from('interface_presets')
        .select(PRESET_COLUMNS)
        .eq('workspace_id', workspaceId!)
        .is('owner_user_id', null)
        .eq('is_deleted', false)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error as Error
      return (data ?? []).map((r) => mapPreset(r as Record<string, unknown>))
    },
  })
}

/**
 * Разрешённый активный профиль пользователя + его слоты.
 * Приоритет: явно активный → дефолтный → первый. Если профилей нет — дефолтные слоты.
 */
export function useActiveInterfacePreset(workspaceId: string | undefined) {
  const { user } = useAuth()
  const presetsQuery = useInterfacePresets(workspaceId)

  const activeQuery = useQuery({
    queryKey: interfacePresetKeys.active(workspaceId, user?.id),
    enabled: Boolean(workspaceId && user?.id),
    staleTime: STALE_TIME.LONG,
    gcTime: GC_TIME.STANDARD,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('user_active_preset')
        .select('preset_id')
        .eq('workspace_id', workspaceId!)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error as Error
      return data?.preset_id ?? null
    },
  })

  const presetsData = presetsQuery.data
  const presets = useMemo<InterfacePreset[]>(
    () => presetsData ?? [],
    [presetsData],
  )
  const activeId = activeQuery.data ?? null

  const preset = useMemo<InterfacePreset | null>(() => {
    if (!presets.length) return null
    return (
      (activeId ? presets.find((p) => p.id === activeId) : undefined) ??
      presets.find((p) => p.is_default) ??
      presets[0] ??
      null
    )
  }, [presets, activeId])

  const slots = useMemo<SidebarSlot[]>(
    () =>
      preset?.config.slots
        ? normalizeSidebarSlots(preset.config.slots)
        : DEFAULT_SIDEBAR_SLOTS,
    [preset],
  )

  return {
    preset,
    presetId: preset?.id ?? null,
    presets,
    activeId,
    slots,
    quickActions: preset?.config.quick_actions ?? [],
    isLoading: presetsQuery.isLoading || activeQuery.isLoading,
  }
}

/** Резолв id профиля, в который пишутся правки активного пользователя. */
async function resolveActivePresetId(
  workspaceId: string,
  userId: string | undefined,
): Promise<string | null> {
  if (userId) {
    const { data: active } = await supabase
      .from('user_active_preset')
      .select('preset_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()
    if (active?.preset_id) {
      // Убедимся, что профиль жив.
      const { data: alive } = await supabase
        .from('interface_presets')
        .select('id')
        .eq('id', active.preset_id)
        .eq('is_deleted', false)
        .maybeSingle()
      if (alive?.id) return alive.id
    }
  }
  const { data: def } = await supabase
    .from('interface_presets')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('owner_user_id', null)
    .eq('is_default', true)
    .eq('is_deleted', false)
    .maybeSingle()
  return def?.id ?? null
}

/**
 * Записать частичный config в активный профиль (мерж с существующим). Если профиля
 * ещё нет (свежий воркспейс) — создаём дефолтный «Основное» с этим config.
 */
export async function writeConfigPatchToActivePreset(
  workspaceId: string,
  userId: string | undefined,
  patch: Partial<InterfacePresetConfig>,
): Promise<void> {
  const presetId = await resolveActivePresetId(workspaceId, userId)
  const now = new Date().toISOString()

  if (!presetId) {
    const { error } = await supabase.from('interface_presets').insert({
      workspace_id: workspaceId,
      name: 'Основное',
      is_default: true,
      owner_user_id: null,
      config: toSupabaseJson(patch as InterfacePresetConfig),
      created_by: userId ?? null,
    })
    if (error) throw error as Error
    return
  }

  const { data: existing } = await supabase
    .from('interface_presets')
    .select('config')
    .eq('id', presetId)
    .maybeSingle()
  const prevConfig =
    // config — нетипизированный jsonb; разбираем через sanctioned-хелпер
    fromSupabaseJson<InterfacePresetConfig>(
      (existing?.config as never) ?? null,
    ) ?? {}

  const { error } = await supabase
    .from('interface_presets')
    .update({
      config: toSupabaseJson({ ...prevConfig, ...patch }),
      updated_at: now,
    })
    .eq('id', presetId)
  if (error) throw error as Error
}

/** Записать слоты сайдбара в активный профиль. */
export function writeSlotsToActivePreset(
  workspaceId: string,
  userId: string | undefined,
  slots: SidebarSlot[],
): Promise<void> {
  return writeConfigPatchToActivePreset(workspaceId, userId, { slots })
}

/** Записать список быстрых действий в активный профиль. */
export function writeQuickActionsToActivePreset(
  workspaceId: string,
  userId: string | undefined,
  quick_actions: import('@/types/quickActions').QuickAction[],
): Promise<void> {
  return writeConfigPatchToActivePreset(workspaceId, userId, { quick_actions })
}

function invalidatePresets(
  qc: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  userId: string | undefined,
) {
  qc.invalidateQueries({ queryKey: interfacePresetKeys.byWorkspace(workspaceId) })
  qc.invalidateQueries({ queryKey: interfacePresetKeys.active(workspaceId, userId) })
  qc.invalidateQueries({
    queryKey: workspaceSidebarSettingsKeys.byWorkspace(workspaceId),
  })
}

/** Переключить активный профиль пользователя. */
export function useSetActivePreset() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: { workspaceId: string; presetId: string }) => {
      if (!user?.id) throw new Error('Нет пользователя')
      const { error } = await supabase.from('user_active_preset').upsert(
        {
          user_id: user.id,
          workspace_id: params.workspaceId,
          preset_id: params.presetId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,workspace_id' },
      )
      if (error) throw error as Error
    },
    onSuccess: (_d, vars) => invalidatePresets(qc, vars.workspaceId, user?.id),
  })
}

/** Создать новый профиль (опц. копией config из существующего). */
export function useCreateInterfacePreset() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: {
      workspaceId: string
      name: string
      icon?: string | null
      color?: string | null
      copyFromPresetId?: string | null
    }): Promise<string> => {
      let config: InterfacePresetConfig = { slots: DEFAULT_SIDEBAR_SLOTS }
      if (params.copyFromPresetId) {
        const { data: src } = await supabase
          .from('interface_presets')
          .select('config')
          .eq('id', params.copyFromPresetId)
          .maybeSingle()
        config =
          // config — нетипизированный jsonb; разбираем через sanctioned-хелпер
          fromSupabaseJson<InterfacePresetConfig>(
            (src?.config as never) ?? null,
          ) ?? config
      }
      const { data: maxRow } = await supabase
        .from('interface_presets')
        .select('order_index')
        .eq('workspace_id', params.workspaceId)
        .is('owner_user_id', null)
        .eq('is_deleted', false)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextOrder = (maxRow?.order_index ?? -1) + 1

      const { data, error } = await supabase
        .from('interface_presets')
        .insert({
          workspace_id: params.workspaceId,
          name: params.name,
          icon: params.icon ?? null,
          color: params.color ?? null,
          is_default: false,
          owner_user_id: null,
          config: toSupabaseJson(config),
          order_index: nextOrder,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error as Error
      return data.id as string
    },
    onSuccess: (_d, vars) => invalidatePresets(qc, vars.workspaceId, user?.id),
  })
}

/** Обновить мета-поля профиля (имя/иконка/цвет). */
export function useUpdateInterfacePreset() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: {
      workspaceId: string
      presetId: string
      name?: string
      icon?: string | null
      color?: string | null
    }) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (params.name !== undefined) patch.name = params.name
      if (params.icon !== undefined) patch.icon = params.icon
      if (params.color !== undefined) patch.color = params.color
      const { error } = await supabase
        .from('interface_presets')
        .update(patch)
        .eq('id', params.presetId)
      if (error) throw error as Error
    },
    onSuccess: (_d, vars) => invalidatePresets(qc, vars.workspaceId, user?.id),
  })
}

/** Дублировать профиль (имя + « (копия)»). */
export function useDuplicateInterfacePreset() {
  const create = useCreateInterfacePreset()
  return useMutation({
    mutationFn: async (params: {
      workspaceId: string
      preset: InterfacePreset
    }) => {
      return create.mutateAsync({
        workspaceId: params.workspaceId,
        name: `${params.preset.name} (копия)`,
        icon: params.preset.icon,
        color: params.preset.color,
        copyFromPresetId: params.preset.id,
      })
    },
  })
}

/** Сохранить список быстрых действий («+») в активный профиль. */
export function useUpdateActiveQuickActions() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: {
      workspaceId: string
      quickActions: import('@/types/quickActions').QuickAction[]
    }) => {
      await writeQuickActionsToActivePreset(
        params.workspaceId,
        user?.id,
        params.quickActions,
      )
    },
    onSuccess: (_d, vars) => invalidatePresets(qc, vars.workspaceId, user?.id),
  })
}

/** Удалить профиль (soft-delete). Дефолтный удалять нельзя. */
export function useDeleteInterfacePreset() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (params: { workspaceId: string; presetId: string }) => {
      const { data: target } = await supabase
        .from('interface_presets')
        .select('is_default')
        .eq('id', params.presetId)
        .maybeSingle()
      if (target?.is_default) {
        throw new Error('Нельзя удалить профиль по умолчанию')
      }
      // Сбросить активный выбор у тех, кто на нём сидит → упадут на дефолтный.
      await supabase
        .from('user_active_preset')
        .delete()
        .eq('preset_id', params.presetId)
      const { error } = await supabase
        .from('interface_presets')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', params.presetId)
      if (error) throw error as Error
    },
    onSuccess: (_d, vars) => invalidatePresets(qc, vars.workspaceId, user?.id),
  })
}
