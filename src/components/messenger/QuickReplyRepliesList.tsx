import { useEffect, useRef } from 'react'
import { FolderOpen } from 'lucide-react'
import { QuickReplyRow } from './QuickReplyRow'
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'

type ReplyItem = QuickReply & { group_name?: string }

type QuickReplyRepliesListProps = {
  isLoading: boolean
  hasReplies: boolean
  hasResults: boolean
  grouped: { noGroup: ReplyItem[]; groups: [string, { name: string; items: ReplyItem[] }][] }
  /** Плоский список видимых шаблонов — для сопоставления с activeIndex навигации. */
  flatItems: ReplyItem[]
  activeIndex: number
  onSelect: (content: string) => void
  onEdit: (e: React.MouseEvent, reply: QuickReply) => void
}

/**
 * Тело вкладки «Быстрые ответы» — сгруппированный список шаблонов.
 * Владеет собственным listRef и скроллом к активному элементу навигации.
 */
export function QuickReplyRepliesList({
  isLoading,
  hasReplies,
  hasResults,
  grouped,
  flatItems,
  activeIndex,
  onSelect,
  onEdit,
}: QuickReplyRepliesListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Скролл к активному элементу навигации стрелками
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (isLoading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Загрузка...</div>
  }
  if (!hasReplies) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">Нет доступных шаблонов</div>
    )
  }
  if (!hasResults) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Ничего не найдено</div>
  }

  return (
    <div className="py-1" ref={listRef}>
      {/* Без группы */}
      {grouped.noGroup.map((r) => (
        <QuickReplyRow
          key={r.id}
          reply={r}
          idx={flatItems.indexOf(r)}
          activeIndex={activeIndex}
          indent={false}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}

      {/* Группы */}
      {grouped.groups.map(([groupId, { name, items }]) => (
        <div key={groupId}>
          <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <FolderOpen className="h-3 w-3" />
            {name}
          </div>
          {items.map((r) => (
            <QuickReplyRow
              key={r.id}
              reply={r}
              idx={flatItems.indexOf(r)}
              activeIndex={activeIndex}
              indent={true}
              onSelect={onSelect}
              onEdit={onEdit}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
