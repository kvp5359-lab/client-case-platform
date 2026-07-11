"use client"

/**
 * Единый компонент: кнопка-триггер popover'а доступа + индикатор состояния.
 * Заменяет связку TemplateAccessBadge + отдельной кнопки в строках дерева.
 *
 * Видимость:
 * - Есть индикатор (personal_only, count > 0) → виден всегда.
 * - Иначе → виден только при ховере родителя с классом `group`.
 */

import { useQuery } from '@tanstack/react-query'
import { Eye, UserCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qrFlagsKeys } from '@/hooks/queryKeys'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TemplateAccessPopover } from '../TemplateAccessPopover'
import {
  getAccessConfig,
  isQuickReply,
  isKnowledgeBase,
  fetchQrFlags,
  KB_MODE_META,
  type TemplateAccessEntityType,
  type KbAccessMode,
} from './helpers'

export function TemplateAccessButton({
  entityId,
  entityType,
  workspaceId,
  preloadedCount,
  mode,
}: {
  entityId: string
  entityType: TemplateAccessEntityType
  workspaceId: string
  preloadedCount?: number
  // Режим доступа сущности базы знаний (передаётся из строки дерева).
  mode?: KbAccessMode
}) {
  const { table, fkColumn, badgeQueryKey } = getAccessConfig(entityType, entityId)
  const isQR = isQuickReply(entityType)
  const isKb = isKnowledgeBase(entityType)

  // Счётчик привязок: у БЗ нужен только в режиме selected; у qr — как раньше.
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
    enabled: preloadedCount === undefined && (!isKb || mode === 'selected'),
  })

  const { data: qrFlags } = useQuery({
    queryKey: qrFlagsKeys.byEntity(entityType, entityId),
    queryFn: () => fetchQrFlags(entityType, entityId),
    enabled: isQR,
  })

  const count = preloadedCount ?? fetchedCount

  // База знаний: иконка отражает режим (везде / наследует / выбранные / нигде).
  if (isKb) {
    const meta = KB_MODE_META[mode ?? 'inherit']
    const Icon = meta.Icon
    const title =
      mode === 'selected'
        ? `Доступ: только в ${count} ${count === 1 ? 'типе' : 'типах'} проектов`
        : `Доступ: ${meta.label.toLowerCase()}`
    return (
      <TemplateAccessPopover entityId={entityId} entityType={entityType} workspaceId={workspaceId}>
        <Button
          variant="ghost"
          size="sm"
          title={title}
          className="h-6 px-1 gap-0.5 hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className={cn('w-3.5 h-3.5', meta.color)} />
          {mode === 'selected' && count > 0 && (
            <span className="text-[10px] text-primary font-medium">{count}</span>
          )}
        </Button>
      </TemplateAccessPopover>
    )
  }

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
