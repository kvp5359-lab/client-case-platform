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
import { quickReplyKeys, projectTemplateKeys, qrFlagsKeys } from '@/hooks/queryKeys'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import {
  getAccessConfig,
  isQuickReply,
  fetchQrFlags,
  type TemplateAccessEntityType,
} from './template-access/helpers'

// Реэкспорт типа для обратной совместимости (entityType используется снаружи).
export type { TemplateAccessEntityType } from './template-access/helpers'

type AccessMode = 'inherit' | 'everywhere' | 'selected' | 'personal_only'

type TemplateAccessPopoverProps = {
  entityId: string
  entityType: TemplateAccessEntityType
  workspaceId: string
  children: React.ReactNode
}

type ProjectTemplate = {
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

  // Загружаем все шаблоны проектов workspace (лёгкий список id+name —
  // отдельный кеш-ключ, чтобы не затирать полный кеш listByWorkspace).
  const { data: allTemplates = [] } = useQuery({
    queryKey: projectTemplateKeys.namesByWorkspace(workspaceId),
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
    queryKey: qrFlagsKeys.byEntity(entityType, entityId),
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
      // table — union из 4 junction-таблиц с разными fk-колонками, а ключ
      // payload вычисляемый ([fkColumn]) → статически не сматчить ни с одной
      // конкретной Insert-формой. Каст здесь обоснован динамикой.
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
        .update(patch)
        .eq('id', entityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qrFlagsKeys.byEntity(entityType, entityId) })
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

// TemplateAccessButton живёт в ./template-access/ — импортируйте напрямую оттуда.
// Реэкспорт убран: он создавал цикл TemplateAccessPopover ↔ TemplateAccessButton (madge).
