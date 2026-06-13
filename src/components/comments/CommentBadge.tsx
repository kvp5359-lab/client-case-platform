"use client"

/**
 * CommentBadge — иконка-счётчик комментариев с попапом
 *
 * Встраивается рядом с сущностью (документ, слот, поле формы, задача).
 * По клику открывает Popover с CommentsPopover.
 *
 * Когда есть незавершённые комментарии — бейдж виден всегда,
 * даже если родительский контейнер скрыт через opacity-0 при hover.
 */

import { MessageCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProjectPermissions } from '@/hooks/permissions/useProjectPermissions'
import { useCommentCounts } from '@/hooks/comments'
import { useBatchedCommentCount } from './CommentCountsContext'
import { CommentsPopover } from './CommentsPopover'
import type { CommentEntityType } from '@/types/comments'

type CommentBadgeProps = {
  entityType: CommentEntityType
  entityId: string
  projectId: string
  workspaceId: string
  /** Внешний счётчик (из пакетной загрузки). Если не передан — загружается автоматически. */
  count?: number
  /**
   * CSS-класс для скрытия пустого бейджа (без комментариев).
   * Например: "opacity-0 group-hover/doc:opacity-100" — бейдж без комментариев
   * появляется только при наведении, а с комментариями виден всегда.
   */
  emptyClassName?: string
}

export function CommentBadge({
  entityType,
  entityId,
  projectId,
  workspaceId,
  count: externalCount,
  emptyClassName,
}: CommentBadgeProps) {
  const { hasModuleAccess } = useProjectPermissions({ projectId })

  // Приоритет источника счётчика: явный проп → пакетный контекст списка →
  // собственный одиночный запрос (fallback, когда провайдера нет — формы/задачи).
  const batchedCount = useBatchedCommentCount(entityType, entityId)
  const needOwnQuery = externalCount === undefined && batchedCount === undefined
  const { data: countsMap } = useCommentCounts(entityType, needOwnQuery ? [entityId] : [])
  const count = externalCount ?? batchedCount ?? countsMap?.get(entityId) ?? 0
  const hasComments = count > 0

  if (!hasModuleAccess('comments')) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`relative inline-flex items-center justify-center h-6 w-6 p-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition ${!hasComments && emptyClassName ? emptyClassName : ''}`}
          onClick={(e) => e.stopPropagation()}
          title="Комментарии"
        >
          {hasComments ? (
            <span className="relative inline-flex items-center justify-center h-[18px] w-[18px]">
              <MessageCircle className="h-[18px] w-[18px] text-blue-500 fill-blue-500" />
              <span className="absolute inset-0 flex items-center justify-center text-white text-[9px] font-bold leading-none pt-[1px]">
                {count > 99 ? '∞' : count}
              </span>
            </span>
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CommentsPopover
          entityType={entityType}
          entityId={entityId}
          projectId={projectId}
          workspaceId={workspaceId}
        />
      </PopoverContent>
    </Popover>
  )
}
