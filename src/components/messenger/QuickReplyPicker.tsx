/**
 * QuickReplyPicker — пикер быстрых ответов для мессенджера.
 * Кнопка с попапом, позволяет вставить готовый шаблон в редактор.
 * Новый формат: группы вместо папок, доступ через group_templates.
 */

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react'
import { Zap, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useQuickRepliesForPicker, useUpdateQuickReply } from '@/hooks/quick-replies/useQuickReplies'
import { QuickReplyFormDialog } from '@/components/directories/QuickReplyFormDialog'
import { QuickReplyRepliesList } from '@/components/messenger/QuickReplyRepliesList'
import { ShareLinksTab } from '@/components/share/ShareLinksTab'
import { QaPickerTab } from '@/components/messenger/QaPickerTab'
import { projectTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'
import type { Editor } from '@tiptap/react'

type QuickReplyPickerProps = {
  editor: Editor
  projectId: string
  workspaceId: string
  /** Если true — открыть попап программно (после сброса вернуть в false через onExternalOpenHandled) */
  externalOpen?: boolean
  onExternalOpenHandled?: () => void
}

export function QuickReplyPicker({
  editor,
  projectId,
  workspaceId,
  externalOpen,
  onExternalOpenHandled,
}: QuickReplyPickerProps) {
  const [open, setOpenState] = useState(false)
  const [search, setSearchState] = useState('')
  const [activeTab, setActiveTab] = useState<
    'replies' | 'qa' | 'articles' | 'descriptions' | 'external'
  >('replies')
  const [activeIndex, setActiveIndex] = useState(-1)
  const openRef = useRef(false)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const updateReply = useUpdateQuickReply(workspaceId)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const setOpen = (val: boolean) => {
    openRef.current = val
    setOpenState(val)
    if (!val) setActiveIndex(-1)
  }
  const setSearch = (val: string) => {
    setSearchState(val)
    setActiveIndex(-1)
  }

  // Открыть попап программно (например, при вводе '/')
  useLayoutEffect(() => {
    if (externalOpen && !openRef.current) {
      setOpen(true)
      onExternalOpenHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- срабатывает только при смене externalOpen
  }, [externalOpen])

  // Закрытие по клику вне попапа
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Автофокус на поиск при открытии
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [open])

  // Личный тред (без проекта) не имеет вкладок статей/документов/внешних —
  // если активна была проектная вкладка, вернуться к «Быстрым ответам».
  useEffect(() => {
    if (!projectId && activeTab !== 'replies' && activeTab !== 'qa') {
      setActiveTab('replies')
    }
  }, [projectId, activeTab])

  // Загружаем template_id проекта (prefetch — чтобы попап открывался мгновенно)
  const { data: projectTemplateId } = useQuery({
    queryKey: projectTemplateKeys.idByProject(projectId),
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', projectId)
        .maybeSingle()
      return data?.template_id ?? null
    },
    enabled: !!projectId,
    staleTime: STALE_TIME.LONG,
  })

  const { data: replies = [], isLoading } = useQuickRepliesForPicker(workspaceId, projectTemplateId)

  // Группировка по группам и фильтрация
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = q ? replies.filter((r) => r.name.toLowerCase().includes(q)) : replies

    // Группируем: без группы → затем по группам
    const noGroup = filtered.filter((r) => !r.group_id)
    const groupMap = new Map<string, { name: string; items: typeof filtered }>()

    for (const r of filtered) {
      if (!r.group_id) continue
      const existing = groupMap.get(r.group_id)
      if (existing) {
        existing.items.push(r)
      } else {
        groupMap.set(r.group_id, {
          name: r.group_name ?? 'Без названия',
          items: [r],
        })
      }
    }

    return { noGroup, groups: [...groupMap.entries()] }
  }, [replies, search])

  const handleSelect = (content: string) => {
    editor.chain().focus().insertContent(content).run()
    setOpen(false)
    setSearch('')
  }

  const handleEditClick = (e: React.MouseEvent, reply: QuickReply) => {
    e.stopPropagation()
    setEditingReply(reply)
  }

  const handleSaveEdit = ({ name, content }: { name: string; content: string }) => {
    if (!editingReply) return
    updateReply.mutate(
      { id: editingReply.id, name, content },
      { onSuccess: () => setEditingReply(null) },
    )
  }

  // Плоский список всех видимых шаблонов для навигации
  const flatItems = useMemo(
    () => [...grouped.noGroup, ...grouped.groups.flatMap(([, { items }]) => items)],
    [grouped],
  )

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    // Навигация стрелками/Enter — только для вкладки быстрых ответов.
    if (activeTab !== 'replies') return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        handleSelect(flatItems[activeIndex].content)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const hasReplies = replies.length > 0
  const hasResults = grouped.noGroup.length > 0 || grouped.groups.length > 0
  // Быстрые ответы + Q&A доступны всегда (в т.ч. в личном треде без проекта —
  // там Q&A отдаёт только режим «везде»). Ссылки на статьи/документы/внешние —
  // только для тредов с проектом.
  const qaProjectId = projectId || null
  const tabList = (
    qaProjectId
      ? ([
          ['replies', 'Быстрые ответы'],
          ['qa', 'Q&A'],
          ['articles', 'Статьи'],
          ['descriptions', 'Документы'],
          ['external', 'Внешние'],
        ] as const)
      : ([
          ['replies', 'Быстрые ответы'],
          ['qa', 'Q&A'],
        ] as const)
  ) as ReadonlyArray<readonly [typeof activeTab, string]>
  const showTabs = true
  // ShareLinksTab понимает только эти три вида.
  const shareView =
    activeTab === 'descriptions' || activeTab === 'external' ? activeTab : 'articles'

  return (
    <>
      <div ref={containerRef} className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Быстрые ответы"
          aria-label="Быстрые ответы"
          onClick={() => setOpen(!open)}
        >
          <Zap className="h-4 w-4" />
        </Button>

        {open && (
          <div className="absolute bottom-full left-0 mb-2 w-[520px] max-w-[calc(100vw-56px)] md:max-w-[calc(100vw-32px)] rounded-md border bg-popover text-popover-foreground shadow-[0_4px_24px_-2px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.07)] overflow-hidden z-50">
            {/* Поиск */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Поиск..."
                  className="h-8 pl-7 pr-7 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      searchInputRef.current?.focus()
                    }}
                    aria-label="Очистить"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Вкладки — единый поиск сверху остаётся на месте, скачков нет.
                На мобиле не переносятся, а скроллятся горизонтально. */}
            {showTabs && (
              <div className="flex items-center gap-1 border-b px-2 py-1 overflow-x-auto scrollbar-hide">
                {tabList.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      activeTab === id
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Вкладка Q&A — вставляет текст ответа (как быстрый ответ). */}
            <div className={cn(activeTab !== 'qa' && 'hidden')}>
              <QaPickerTab
                editor={editor}
                workspaceId={workspaceId}
                projectId={qaProjectId}
                search={search}
                enabled={open}
                onInserted={() => {
                  setOpen(false)
                  setSearch('')
                }}
              />
            </div>

            {/* Ссылки на статьи/документы/внешние — только для тредов с проектом. */}
            {qaProjectId && (
              <div className={cn((activeTab === 'replies' || activeTab === 'qa') && 'hidden')}>
                <ShareLinksTab
                  editor={editor}
                  projectId={qaProjectId}
                  search={search}
                  enabled={open}
                  view={shareView}
                  onInserted={() => {
                    setOpen(false)
                    setSearch('')
                  }}
                />
              </div>
            )}

            <div
              className={cn(
                'overflow-y-auto overflow-x-hidden',
                // С вкладками — фиксированная высота (не скачет при смене вкладки/фильтре).
                showTabs ? 'h-[400px]' : 'max-h-[450px]',
                showTabs && activeTab !== 'replies' && 'hidden',
              )}
            >
              <QuickReplyRepliesList
                isLoading={isLoading}
                hasReplies={hasReplies}
                hasResults={hasResults}
                grouped={grouped}
                flatItems={flatItems}
                activeIndex={activeIndex}
                onSelect={handleSelect}
                onEdit={handleEditClick}
              />
            </div>
          </div>
        )}
      </div>

      <QuickReplyFormDialog
        key={editingReply?.id ?? 'new'}
        open={!!editingReply}
        onOpenChange={(o) => {
          if (!o) setEditingReply(null)
        }}
        editingReply={editingReply}
        onSave={handleSaveEdit}
        saving={updateReply.isPending}
      />
    </>
  )
}
