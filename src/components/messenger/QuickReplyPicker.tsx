/**
 * QuickReplyPicker — пикер быстрых ответов для мессенджера.
 * Кнопка с попапом, позволяет вставить готовый шаблон в редактор.
 * Новый формат: группы вместо папок, доступ через group_templates.
 */

import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react'
import { Zap, FolderOpen, Search, FileText, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useQuickRepliesForPicker, useUpdateQuickReply } from '@/hooks/useQuickReplies'
import { QuickReplyFormDialog } from '@/components/directories/QuickReplyFormDialog'
import type { QuickReply } from '@/hooks/useQuickReplies'
import type { Editor } from '@tiptap/react'

interface QuickReplyPickerProps {
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
  const [activeIndex, setActiveIndex] = useState(-1)
  const openRef = useRef(false)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const updateReply = useUpdateQuickReply(workspaceId)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  // Загружаем template_id проекта (prefetch — чтобы попап открывался мгновенно)
  const { data: projectTemplateId } = useQuery({
    queryKey: ['project-template-id', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('template_id')
        .eq('id', projectId)
        .maybeSingle()
      return data?.template_id ?? null
    },
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
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

  const stripHtml = useCallback((html: string) => {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return (tmp.textContent || tmp.innerText || '').trim()
  }, [])

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

  // Скролл к активному элементу
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const hasReplies = replies.length > 0
  const hasResults = grouped.noGroup.length > 0 || grouped.groups.length > 0

  return (
    <>
      <div ref={containerRef} className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Быстрые ответы"
          onClick={() => setOpen(!open)}
        >
          <Zap className="h-4 w-4" />
        </Button>

        {open && (
          <div className="absolute bottom-full left-0 mb-2 w-[440px] max-w-[calc(100vw-32px)] rounded-md border bg-popover text-popover-foreground shadow-[0_4px_24px_-2px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.07)] overflow-hidden z-50">
            {/* Поиск */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Поиск шаблонов..."
                  className="h-8 pl-7 text-sm"
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Загрузка...</div>
              ) : !hasReplies ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Нет доступных шаблонов
                </div>
              ) : !hasResults ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Ничего не найдено
                </div>
              ) : (
                <div className="py-1" ref={listRef}>
                  {/* Без группы */}
                  {grouped.noGroup.map((r) => {
                    const idx = flatItems.indexOf(r)
                    return (
                      <ReplyRow
                        key={r.id}
                        reply={r}
                        idx={idx}
                        activeIndex={activeIndex}
                        indent={false}
                        stripHtml={stripHtml}
                        onSelect={handleSelect}
                        onEdit={handleEditClick}
                      />
                    )
                  })}

                  {/* Группы */}
                  {grouped.groups.map(([groupId, { name, items }]) => (
                    <div key={groupId}>
                      <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <FolderOpen className="h-3 w-3" />
                        {name}
                      </div>
                      {items.map((r) => {
                        const idx = flatItems.indexOf(r)
                        return (
                          <ReplyRow
                            key={r.id}
                            reply={r}
                            idx={idx}
                            activeIndex={activeIndex}
                            indent={true}
                            stripHtml={stripHtml}
                            onSelect={handleSelect}
                            onEdit={handleEditClick}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
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

// --- Строка шаблона с иконкой редактирования при ховере ---

function ReplyRow({
  reply,
  idx,
  activeIndex,
  indent,
  stripHtml,
  onSelect,
  onEdit,
}: {
  reply: QuickReply & { group_name?: string }
  idx: number
  activeIndex: number
  indent: boolean
  stripHtml: (html: string) => string
  onSelect: (content: string) => void
  onEdit: (e: React.MouseEvent, reply: QuickReply) => void
}) {
  const isActive = activeIndex === idx

  return (
    <div
      data-idx={idx}
      className={`qr-row group relative flex items-center min-w-0 ${indent ? 'pl-7' : 'pl-3'} pr-3 py-1 transition-colors cursor-pointer overflow-hidden ${isActive ? 'bg-accent' : 'hover:bg-accent'}`}
      onClick={() => onSelect(reply.content)}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-2" />
      <span className="text-sm font-medium shrink-0 mr-1 max-w-[40%] truncate">{reply.name}</span>
      {reply.content && (
        <span className="text-xs text-muted-foreground truncate">{stripHtml(reply.content)}</span>
      )}
      {/* Кнопка редактирования — поверх текста справа с градиентным fade */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center pr-1.5 pl-6 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
        style={{ background: 'linear-gradient(to right, transparent, var(--color-accent) 40%)' }}
      >
        <button
          type="button"
          onClick={(e) => onEdit(e, reply)}
          className="p-1 rounded hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground"
          title="Редактировать шаблон"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
