"use client"

/**
 * Попап мультивыбора для @-упоминаний — как пикер исполнителей: видимое поле
 * поиска, аватарки, чекбоксы. Отмечаешь нескольких → «Упомянуть» вставляет все
 * инлайн-теги сразу.
 *
 * Поле поиска автофокусится; клики по строкам/кнопкам — onMouseDown preventDefault,
 * чтобы не уводить фокус из поля (а сам Tiptap-suggestion остаётся активным, т.к.
 * @ в доке не меняется при блюре редактора).
 */
import { useState } from 'react'
import Image from 'next/image'
import { Check, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MentionItem } from './messengerMention'

export function MentionMultiSelectPopup({
  items,
  onConfirm,
  onClose,
}: {
  items: MentionItem[]
  onConfirm: (ids: string[]) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const query = q.trim().toLowerCase()
  const filtered = items.filter((i) => !query || i.label.toLowerCase().includes(query))
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <div className="w-[260px] max-h-80 flex flex-col rounded-md border bg-popover shadow-md overflow-hidden">
      {/* Поиск */}
      <div className="px-2 py-2 border-b">
        <div className="flex items-center gap-2 border rounded-md px-2 py-1">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (selected.size > 0) onConfirm([...selected])
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
      <div className="overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Никого не найдено</div>
        )}
        {filtered.map((it) => {
          const on = selected.has(it.id)
          return (
            <button
              key={it.id}
              type="button"
              onMouseDown={keepFocus}
              onClick={() => toggle(it.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                on ? 'bg-accent' : 'hover:bg-muted/50',
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
              <div
                className={cn(
                  'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                  on ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                )}
              >
                {on && <Check className="w-3 h-3" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Подтверждение */}
      <div className="border-t p-1.5">
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={() => onConfirm([...selected])}
          disabled={selected.size === 0}
          className="w-full rounded-md bg-primary text-primary-foreground text-xs font-medium py-1.5 disabled:opacity-50 transition-opacity"
        >
          Упомянуть{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>
    </div>
  )
}
