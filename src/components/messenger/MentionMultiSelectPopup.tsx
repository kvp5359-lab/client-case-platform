"use client"

/**
 * Попап мультивыбора для @-упоминаний. Вид как у пикера исполнителей:
 * аватарки, поиск (через ввод после @), чекбоксы. Отмечаешь нескольких →
 * «Упомянуть» вставляет все инлайн-теги сразу.
 *
 * onMouseDown preventDefault на корне — чтобы клики не уводили фокус из
 * редактора (иначе Tiptap-suggestion закроется).
 */
import Image from 'next/image'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MentionItem } from './messengerMention'

export function MentionMultiSelectPopup({
  items,
  selectedIds,
  onToggle,
  onConfirm,
}: {
  items: MentionItem[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onConfirm: () => void
}) {
  return (
    <div
      className="min-w-[220px] max-h-72 flex flex-col rounded-md border bg-popover shadow-md overflow-hidden"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Никого не найдено</div>
        )}
        {items.map((it) => {
          const on = selectedIds.has(it.id)
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
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
      <div className="border-t p-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={selectedIds.size === 0}
          className="w-full rounded-md bg-primary text-primary-foreground text-xs font-medium py-1.5 disabled:opacity-50 transition-opacity"
        >
          Упомянуть{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
        </button>
      </div>
    </div>
  )
}
