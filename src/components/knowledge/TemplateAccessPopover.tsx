/**
 * Универсальный попап для настройки доступа шаблонов проектов.
 *
 * Поддерживает 4 типа сущностей:
 * - group: knowledge_group_templates (группы базы знаний)
 * - article: knowledge_article_templates (статьи базы знаний)
 * - qr-group: quick_reply_group_templates (группы быстрых ответов)
 * - qr-reply: quick_reply_templates (отдельные быстрые ответы)
 */

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys, quickReplyKeys } from '@/hooks/queryKeys'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type TemplateAccessEntityType = 'group' | 'article' | 'qr-group' | 'qr-reply'

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
  // null = ещё не загружено, синхронизируем с данными после загрузки
  const [mode, setMode] = useState<'everywhere' | 'selected' | null>(null)
  const queryClient = useQueryClient()

  const { table, fkColumn, queryKey, badgeQueryKey } = getAccessConfig(entityType, entityId)

  // Загружаем все шаблоны проектов workspace
  const { data: allTemplates = [] } = useQuery({
    queryKey: ['project-templates', workspaceId],
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

  // Вычисляем начальный mode из данных query (без setState в effect/render)
  const derivedMode = useMemo(() => {
    if (isLoading || !open) return null
    return linkedTemplateIds.length === 0 ? 'everywhere' : 'selected'
  }, [isLoading, open, linkedTemplateIds.length])

  // Используем пользовательский mode если он задан, иначе — вычисленный из данных
  const effectiveMode = mode ?? derivedMode

  // Сбрасываем mode при закрытии попапа
  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) setMode(null)
  }

  // Добавить связь
  const addMutation = useMutation({
    mutationFn: async (templateId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(table) as any).insert({
        [fkColumn]: entityId,
        project_template_id: templateId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
    },
    onError: () => {
      toast.error('Не удалось добавить доступ')
    },
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
    },
    onError: () => {
      toast.error('Не удалось убрать доступ')
    },
  })

  const isEverywhere = effectiveMode === 'everywhere'

  // Удалить все привязки (переключиться в режим «везде»)
  const removeAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(table).delete().eq(fkColumn, entityId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      queryClient.invalidateQueries({ queryKey: badgeQueryKey })
    },
    onError: () => {
      toast.error('Не удалось изменить доступ')
    },
  })

  const handleToggle = (templateId: string) => {
    if (linkedTemplateIds.includes(templateId)) {
      removeMutation.mutate(templateId)
    } else {
      addMutation.mutate(templateId)
    }
  }

  const handleModeChange = (everywhere: boolean) => {
    if (everywhere) {
      setMode('everywhere')
      if (linkedTemplateIds.length > 0) {
        removeAllMutation.mutate()
      }
    } else {
      setMode('selected')
      // Привязки не добавляем — пользователь выберет чекбоксами
    }
  }

  const isPending = addMutation.isPending || removeMutation.isPending || removeAllMutation.isPending

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Доступ для типов проектов
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Переключатель режима */}
            <div className="space-y-1 mb-2">
              <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                <input
                  type="radio"
                  className="accent-primary"
                  checked={isEverywhere}
                  onChange={() => handleModeChange(true)}
                  disabled={isPending}
                />
                <span>Везде</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-2 px-1.5 py-1 rounded text-sm',
                  allTemplates.length > 0
                    ? 'hover:bg-muted/50 cursor-pointer'
                    : 'opacity-50 cursor-not-allowed',
                )}
              >
                <input
                  type="radio"
                  className="accent-primary"
                  checked={!isEverywhere}
                  onChange={() => handleModeChange(false)}
                  disabled={isPending || allTemplates.length === 0}
                />
                <span>Только в выбранных</span>
              </label>
            </div>

            {/* Список типов проектов — только когда выбран режим «только в выбранных» */}
            {!isEverywhere &&
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
    queryKey: ['template-access-counts', entityType, ...entityIds],
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
 * Бейдж-счётчик привязанных шаблонов (для отображения рядом с сущностью).
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

  const count = preloadedCount ?? fetchedCount

  if (count === 0) return null

  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
      title={`Доступна в ${count} типах проектов`}
    >
      <LayoutTemplate className="w-3 h-3" />
      {count}
    </span>
  )
}
