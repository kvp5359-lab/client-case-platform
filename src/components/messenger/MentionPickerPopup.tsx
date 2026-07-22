"use client"

/**
 * Попап @-упоминаний (одиночный выбор, как в Telegram/Slack): видимое поле
 * поиска, аватарки, список. Клик по человеку ИЛИ Enter по подсвеченной строке
 * сразу вставляет тег и закрывает попап. Хочешь ещё упоминание — снова «@».
 *
 * Поле поиска автофокусится; клики по строкам — onMouseDown preventDefault,
 * чтобы не уводить фокус из поля (а сам Tiptap-suggestion остаётся активным, т.к.
 * @ в доке не меняется при блюре редактора). Навигация ↑/↓/Enter/Escape — в поле.
 */
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MentionItem } from './messengerMention'

export function MentionPickerPopup({
  items,
  onSelect,
  onClose,
}: {
  items: MentionItem[]
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const query = q.trim().toLowerCase()
  const filtered = items.filter((i) => !query || i.label.toLowerCase().includes(query))
  // Активный индекс держим в границах на чтении (без эффекта-клампинга).
  const active = filtered.length ? Math.min(activeIndex, filtered.length - 1) : 0
  // Заголовки групп показываем, только когда в списке есть ОБЕ группы —
  // иначе одинокий заголовок над однородным списком лишь шумит.
  const showGroupHeaders =
    filtered.some((i) => i.group === 'related') && filtered.some((i) => i.group === 'staff')
  const GROUP_LABELS: Record<string, string> = {
    related: 'По задаче',
    staff: 'Все сотрудники',
  }

  // Подскроллить активную строку в зону видимости.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div className="relative">
      {/* Крестик закрытия — кружком на верхнем правом углу (с нахлёстом). */}
      <button
        type="button"
        title="Закрыть"
        onMouseDown={keepFocus}
        onClick={onClose}
        className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border bg-popover shadow-sm flex items-center justify-center text-muted-foreground transition-all hover:scale-110 hover:bg-muted hover:text-foreground active:scale-95"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="w-[260px] max-h-80 flex flex-col rounded-md border bg-popover shadow-md overflow-hidden">
        {/* Поиск */}
        <div className="px-2 py-2 border-b">
          <div className="flex items-center gap-2 border rounded-md px-2 py-1">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex(Math.min(active + 1, filtered.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex(Math.max(active - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const it = filtered[active]
                  if (it) onSelect(it.id)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  onClose()
                }
              }}
              placeholder="Поиск..."
              className="text-sm bg-transparent focus:outline-none w-full"
            />
            {q && (
              <button type="button" onMouseDown={keepFocus} onClick={() => setQ('')} className="shrink-0">
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>

        {/* Список */}
        <div ref={listRef} className="overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Никого не найдено</div>
          )}
          {filtered.map((it, idx) => (
            <div key={it.id}>
              {showGroupHeaders && it.group && filtered[idx - 1]?.group !== it.group && (
                <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground select-none">
                  {GROUP_LABELS[it.group]}
                </div>
              )}
            <button
              type="button"
              data-idx={idx}
              onMouseDown={keepFocus}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => onSelect(it.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                idx === active ? 'bg-accent' : 'hover:bg-muted/50',
              )}
            >
              {it.avatarUrl ? (
                <Image
                  src={it.avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                  {(it.label[0] ?? '?').toUpperCase()}
                </div>
              )}
              <span className="text-sm truncate flex-1">{it.label}</span>
            </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
