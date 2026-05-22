/**
 * Универсальный попап для настройки доступа шаблонов проектов.
 *
 * Поддерживает 4 типа сущностей:
 * - group: knowledge_group_templates (группы базы знаний)
 * - article: knowledge_article_templates (статьи базы знаний)
 * - qr-group: quick_reply_group_templates (группы быстрых ответов)
 * - qr-reply: quick_reply_templates (отдельные быстрые ответы)
 *
 * Для qr-* доступны 3-4 режима:
 *   inherit (только для qr-reply с group_id) → берёт настройку от группы
 *   everywhere → виден везде (пустой junction, personal_only=false)
 *   selected → виден только в выбранных шаблонах проектов (junction непустой)
 *   personal_only → виден только в личных диалогах (personal_only=true, junction пустой)
 *
 * Для группового/статей базы знаний — только 2 режима (everywhere/selected) — как раньше.
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys, quickReplyKeys, projectTemplateKeys, templateAccessKeys } from '@/hooks/queryKeys'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, UserCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type TemplateAccessEntityType = 'group' | 'article' | 'qr-group' | 'qr-reply'

type AccessMode = 'inherit' | 'everywhere' | 'selected' | 'personal_only'

// Маппинг entityType → { table, fkColumn, accessQueryKey, badgeQueryKey }
function getAccessConfig(entityType: TemplateAccessEntityType, entityId: string) {
  switch (entityType) {
    case 'group':
      return {
        table: 'knowledge_group_templates' as const,
        fkColumn: 'group_id',
        queryKey: [...knowledgeBaseKeys.groupAccess(entityId), 'ids'],
        badgeQueryKey: knowledgeBaseKeys.groupAccess(entityId),
      }
    case 'article':
      return {
        table: 'knowledge_article_templates' as const,
        fkColumn: 'article_id',
        queryKey: [...knowledgeBaseKeys.articleAccess(entityId), 'ids'],
        badgeQueryKey: knowledgeBaseKeys.articleAccess(entityId),
      }
    case 'qr-group':
      return {
        table: 'quick_reply_group_templates' as const,
        fkColumn: 'group_id',
        queryKey: [...quickReplyKeys.groupAccess(entityId), 'ids'],
        badgeQueryKey: quickReplyKeys.groupAccess(entityId),
      }
    case 'qr-reply':
      return {
        table: 'quick_reply_templates' as const,
        fkColumn: 'reply_id',
        queryKey: [...quickReplyKeys.replyAccess(entityId), 'ids'],
        badgeQueryKey: quickReplyKeys.replyAccess(entityId),
      }
  }
}

function isQuickReply(t: TemplateAccessEntityType) {
  return t === 'qr-group' || t === 'qr-reply'
}

interface QrFlags {
  personal_only: boolean
  access_inherits: boolean
  group_id: string | null
}

/** Единая загрузка флагов qr-* — общий queryKey + shape для Popover и Badge */
async function fetchQrFlags(
  entityType: TemplateAccessEntityType,
  entityId: string,
): Promise<QrFlags | null> {
  if (entityType === 'qr-group') {
    const { data, error } = await supabase
      .from('quick_reply_groups')
      .select('personal_only')
      .eq('id', entityId)
      .single()
    if (error) throw error
    return { personal_only: data.personal_only, access_inherits: false, group_id: null }
  }
  if (entityType === 'qr-reply') {
    const { data, error } = await supabase
      .from('quick_replies')
      .select('personal_only, access_inherits, group_id')
      .eq('id', entityId)
      .single()
    if (error) throw error
    return data as QrFlags
  }
  return null
}

interface TemplateAccessPopoverProps {
  entityId: string
  entityType: TemplateAccessEntityType
  workspaceId: string
  children: React.ReactNode
}

interface ProjectTemplate {
  id: string
  name: string
}

export function TemplateAccessPopover({
  entityId,
  entityType,
  workspaceId,
  children,
}: TemplateAccessPopoverProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AccessMode | null>(null)
  const queryClient = useQueryClient()

  const { table, fkColumn, queryKey, badgeQueryKey } = getAccessConfig(entityType, entityId)
  const isQR = isQuickReply(entityType)

  // Загружаем все шаблоны проектов workspace
  const { data: allTemplates = [] } = useQuery({
    queryKey: projectTemplateKeys.listByWorkspace(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return (data || []) as ProjectTemplate[]
    },
    enabled: open && !!workspaceId,
  })

  // Загружаем текущие привязки
  const { data: linkedTemplateIds = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('project_template_id')
        .eq(fkColumn, entityId)
      if (error) throw error
      return (data || []).map((r) => r.project_template_id)
    },
    enabled: open,
  })

  // Подгружаем флаги personal_only / access_inherits для qr-*
  const { data: qrFlags } = useQuery({
    queryKey: ['qr-flags', entityType, entityId],
    queryFn: () => fetchQrFlags(entityType, entityId),
    enabled: open && isQR,
  })

  // Вычисляем «эффективный» режим из текущих данных
  const derivedMode: AccessMode | null = useMemo(() => {
    if (isLoading || !open) return null
    if (isQR && qrFlags === undefined) return null
    if (isQR && qrFlags) {
      if (qrFlags.access_inherits && qrFlags.group_id) return 'inherit'
      if (qrFlags.personal_only) return 'personal_only'
    }
    return linkedTemplateIds.length === 0 ? 'everywhere' : 'selected'
  }, [isLoading, open, isQR, qrFlags, linkedTemplateIds.length])

  const effectiveMode: AccessMode | null = mode ?? derivedMode

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) setMode(null)
  }

  // Добавить связь
  const addMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const payload = { [fkColumn]: entityId, project_template_id: templateId }
      const { error } = await supabase.from(table).insert(payload as never)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
      if (isQR) queryClient.invalidateQueries({ queryKey: quickReplyKeys.all })
    },
    onError: () => toast.error('Не удалось добавить доступ'),
  })

  // Удалить связь
  const removeMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(fkColumn, entityId)
        .eq('project_template_id', templateId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
      if (isQR) queryClient.invalidateQueries({ queryKey: quickReplyKeys.all })
    },
    onError: () => toast.error('Не удалось убрать доступ'),
  })

  // Снять все junction-привязки
  const removeAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(table).delete().eq(fkColumn, entityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
      if (isQR) queryClient.invalidateQueries({ queryKey: quickReplyKeys.all })
    },
    onError: () => toast.error('Не удалось изменить доступ'),
  })

  // Обновить qr-флаги (personal_only / access_inherits).
  // У групп нет колонки access_inherits — отправляем только personal_only.
  const updateQrFlagsMutation = useMutation({
    mutationFn: async (patch: { personal_only?: boolean; access_inherits?: boolean }) => {
      if (entityType === 'qr-group') {
        const groupPatch: { personal_only?: boolean } = {}
        if (patch.personal_only !== undefined) groupPatch.personal_only = patch.personal_only
        if (Object.keys(groupPatch).length === 0) return
        const { error } = await supabase
          .from('quick_reply_groups')
          .update(groupPatch)
          .eq('id', entityId)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('quick_replies')
        .update(patch as never)
        .eq('id', entityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qr-flags', entityType, entityId] })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
      queryClient.invalidateQueries({ queryKey: quickReplyKeys.all })
    },
    onError: () => toast.error('Не удалось изменить доступ'),
  })

  const handleToggle = (templateId: string) => {
    if (linkedTemplateIds.includes(templateId)) {
      removeMutation.mutate(templateId)
    } else {
      addMutation.mutate(templateId)
    }
  }

  const handleModeChange = async (next: AccessMode) => {
    setMode(next)

    // KB-режимы — только everywhere/selected, по пустоте junction
    if (!isQR) {
      if (next === 'everywhere' && linkedTemplateIds.length > 0) removeAllMutation.mutate()
      return
    }

    // qr-* режимы
    if (next === 'inherit') {
      if (linkedTemplateIds.length > 0) removeAllMutation.mutate()
      updateQrFlagsMutation.mutate({ access_inherits: true, personal_only: false })
      return
    }
    if (next === 'everywhere') {
      if (linkedTemplateIds.length > 0) removeAllMutation.mutate()
      updateQrFlagsMutation.mutate({ access_inherits: false, personal_only: false })
      return
    }
    if (next === 'personal_only') {
      if (linkedTemplateIds.length > 0) removeAllMutation.mutate()
      updateQrFlagsMutation.mutate({ access_inherits: false, personal_only: true })
      return
    }
    if (next === 'selected') {
      updateQrFlagsMutation.mutate({ access_inherits: false, personal_only: false })
      // привязки пользователь поставит чекбоксами
    }
  }

  const isPending =
    addMutation.isPending ||
    removeMutation.isPending ||
    removeAllMutation.isPending ||
    updateQrFlagsMutation.isPending

  // Показывать ли пункт «Наследовать от группы»
  const showInherit = entityType === 'qr-reply' && !!qrFlags?.group_id

  const radioRow = (val: AccessMode, label: string, disabled = false) => (
    <label
      className={cn(
        'flex items-center gap-2 px-1.5 py-1 rounded text-sm',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer',
      )}
    >
      <input
        type="radio"
        className="accent-primary"
        checked={effectiveMode === val}
        onChange={() => handleModeChange(val)}
        disabled={isPending || disabled}
      />
      <span>{label}</span>
    </label>
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Доступ для типов проектов
        </div>

        {isLoading || (isQR && qrFlags === undefined) ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-1 mb-2">
              {showInherit && (
                <>
                  {radioRow('inherit', 'Наследовать от группы')}
                  <div className="border-t my-1" />
                </>
              )}
              {radioRow('everywhere', 'Везде')}
              {isQR && radioRow('personal_only', 'Только без проектов')}
              {radioRow('selected', 'Только в выбранных', allTemplates.length === 0)}
            </div>

            {/* Список типов проектов — только в режиме selected */}
            {effectiveMode === 'selected' &&
              (allTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1 px-1.5">Нет типов проектов</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto border-t pt-2 mt-1">
                  {allTemplates.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={linkedTemplateIds.includes(t.id)}
                        onCheckedChange={() => handleToggle(t.id)}
                        disabled={isPending}
                      />
                      <span className="truncate">{t.name}</span>
                    </label>
                  ))}
                </div>
              ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Хук для пакетной загрузки счётчиков привязанных шаблонов.
 */
export function useTemplateAccessCounts(entityIds: string[], entityType: TemplateAccessEntityType) {
  const config = entityIds.length > 0 ? getAccessConfig(entityType, entityIds[0]) : null
  const table = config?.table
  const fkColumn = config?.fkColumn

  return useQuery({
    queryKey: templateAccessKeys.counts(entityType, entityIds),
    queryFn: async () => {
      if (entityIds.length === 0 || !table || !fkColumn) return {} as Record<string, number>
      const { data, error } = await supabase.from(table).select(fkColumn).in(fkColumn, entityIds)
      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of data || []) {
        const id = (row as unknown as Record<string, string>)[fkColumn]
        counts[id] = (counts[id] || 0) + 1
      }
      return counts
    },
    enabled: entityIds.length > 0,
  })
}

/**
 * Бейдж-счётчик привязанных шаблонов. Для qr-* также показывает иконку
 * «только в личных» при personal_only=true.
 */
export function TemplateAccessBadge({
  entityId,
  entityType,
  preloadedCount,
}: {
  entityId: string
  entityType: TemplateAccessEntityType
  preloadedCount?: number
}) {
  const { table, fkColumn, badgeQueryKey } = getAccessConfig(entityType, entityId)
  const isQR = isQuickReply(entityType)

  const { data: fetchedCount = 0 } = useQuery({
    queryKey: badgeQueryKey,
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(fkColumn, entityId)
      if (error) throw error
      return count ?? 0
    },
    enabled: preloadedCount === undefined,
  })

  // Тот же queryKey и фетчер, что в TemplateAccessPopover — чтобы кэш был согласован
  const { data: qrFlags } = useQuery({
    queryKey: ['qr-flags', entityType, entityId],
    queryFn: () => fetchQrFlags(entityType, entityId),
    enabled: isQR,
  })

  const count = preloadedCount ?? fetchedCount

  if (qrFlags?.personal_only) {
    return (
      <span
        className="inline-flex items-center text-[10px] text-muted-foreground"
        title="Доступен только в личных диалогах"
      >
        <UserCircle2 className="w-3 h-3" />
      </span>
    )
  }

  if (count === 0) return null

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
      title={`Доступна в ${count} типах проектов`}
    >
      <Eye className="w-3 h-3" />
      {count}
    </span>
  )
}

/**
 * Единый компонент: кнопка-триггер popover'а доступа + индикатор состояния.
 * Заменяет связку TemplateAccessBadge + отдельной кнопки в строках дерева.
 *
 * Видимость:
 * - Есть индикатор (personal_only, count > 0) → виден всегда.
 * - Иначе → виден только при ховере родителя с классом `group`.
 */
export function TemplateAccessButton({
  entityId,
  entityType,
  workspaceId,
  preloadedCount,
}: {
  entityId: string
  entityType: TemplateAccessEntityType
  workspaceId: string
  preloadedCount?: number
}) {
  const { table, fkColumn, badgeQueryKey } = getAccessConfig(entityType, entityId)
  const isQR = isQuickReply(entityType)

  const { data: fetchedCount = 0 } = useQuery({
    queryKey: badgeQueryKey,
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(fkColumn, entityId)
      if (error) throw error
      return count ?? 0
    },
    enabled: preloadedCount === undefined,
  })

  const { data: qrFlags } = useQuery({
    queryKey: ['qr-flags', entityType, entityId],
    queryFn: () => fetchQrFlags(entityType, entityId),
    enabled: isQR,
  })

  const count = preloadedCount ?? fetchedCount
  const isPersonal = !!qrFlags?.personal_only
  const hasIndicator = isPersonal || count > 0

  const title = isPersonal
    ? 'Доступен только в личных диалогах'
    : count > 0
      ? `Доступна в ${count} типах проектов`
      : 'Доступ для типов проектов'

  return (
    <TemplateAccessPopover entityId={entityId} entityType={entityType} workspaceId={workspaceId}>
      <Button
        variant="ghost"
        size="sm"
        title={title}
        className={`h-6 px-1 gap-0.5 text-muted-foreground/50 hover:text-foreground ${
          hasIndicator ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {isPersonal ? <UserCircle2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {!isPersonal && count > 0 && <span className="text-[10px]">{count}</span>}
      </Button>
    </TemplateAccessPopover>
  )
}
