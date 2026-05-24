"use client"

/**
 * Бейдж-счётчик привязанных шаблонов. Для qr-* также показывает иконку
 * «только в личных» при personal_only=true.
 */

import { useQuery } from '@tanstack/react-query'
import { Eye, UserCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { qrFlagsKeys } from '@/hooks/queryKeys'
import {
  getAccessConfig,
  isQuickReply,
  fetchQrFlags,
  type TemplateAccessEntityType,
} from './helpers'

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
    queryKey: qrFlagsKeys.byEntity(entityType, entityId),
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
