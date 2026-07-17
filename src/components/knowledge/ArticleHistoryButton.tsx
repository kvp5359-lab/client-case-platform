'use client'

/**
 * История открытых статей (per-user, «недавние»). Выпадашка в тулбаре БЗ:
 * список сгруппирован по дате (Сегодня/Вчера/дата), у каждой — время открытия.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import {
  useRecentlyViewedArticles,
  useTrackRecentView,
  type RecentlyViewedRow,
} from '@/hooks/useGlobalSearch'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = startOfDay(new Date())
  const day = startOfDay(d)
  const diffDays = Math.round((today - day) / 86_400_000)
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Вчера'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

type DayGroup = { key: string; label: string; rows: RecentlyViewedRow[] }

function groupByDay(rows: RecentlyViewedRow[]): DayGroup[] {
  const groups: DayGroup[] = []
  const index = new Map<string, DayGroup>()
  for (const r of rows) {
    const key = String(startOfDay(new Date(r.opened_at)))
    let g = index.get(key)
    if (!g) {
      g = { key, label: dayLabel(r.opened_at), rows: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.rows.push(r)
  }
  return groups
}

export function ArticleHistoryButton({
  workspaceId,
  triggerVariant = 'outline',
  triggerClassName,
}: {
  workspaceId: string
  triggerVariant?: 'outline' | 'ghost'
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const { data: items = [], isLoading } = useRecentlyViewedArticles(workspaceId)
  const layoutPanel = useLayoutTaskPanel()
  const router = useRouter()
  const { mutate: track } = useTrackRecentView()

  const groups = useMemo(() => groupByDay(items), [items])

  const openArticle = (r: RecentlyViewedRow) => {
    if (layoutPanel?.openKnowledgeArticleTab) {
      layoutPanel.openKnowledgeArticleTab(r.entity_id, r.title ?? 'Статья')
    } else {
      router.push(`/workspaces/${workspaceId}/knowledge-base/${r.entity_id}`)
    }
    track({ workspaceId, entityType: 'knowledge_article', entityId: r.entity_id })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={triggerVariant}
          className={triggerClassName ?? 'w-8 h-8 p-0'}
          title="История открытий"
        >
          <History className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
          История открытий
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Пока пусто</div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="sticky top-0 bg-popover px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {g.label}
                </div>
                {g.rows.map((r) => (
                  <button
                    key={`${r.entity_id}-${r.opened_at}`}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/60 text-left"
                    onClick={() => openArticle(r)}
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate flex-1">{r.title ?? 'Без названия'}</span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums">
                      {timeLabel(r.opened_at)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
