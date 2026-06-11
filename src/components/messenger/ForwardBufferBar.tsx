import { useMemo, useState } from 'react'
import { Forward, X, ChevronDown, ChevronUp, Check, Paperclip, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { stripHtml } from '@/utils/format/messengerHtml'
import type { ForwardBufferItem } from '@/store/sidePanelStore'
import type { ForwardMode } from '@/utils/messenger/forwardContent'

type ForwardBufferBarProps = {
  items: ForwardBufferItem[]
  onInsert: (items: ForwardBufferItem[], mode: ForwardMode) => void
  onRemove: (id: string) => void
  onClear: () => void
}

function itemPreview(item: ForwardBufferItem): string {
  if (item.kind === 'file') return item.attachments[0]?.file_name ?? 'Файл'
  const text = stripHtml(item.content).trim()
  return text && text !== '📎' ? text : 'Сообщение'
}

/**
 * Плашка «буфера пересылки» над полем ввода. Показывается в любом чате, пока
 * буфер не пуст. Блоки гранулярные (текст и файлы по отдельности) — отмечаешь
 * нужные и вставляешь в текущее поле ввода: текст цитатой/оригиналом, файлы —
 * чипами вложений. Дальше отправляешь обычной кнопкой отправки.
 */
export function ForwardBufferBar({ items, onInsert, onRemove, onClear }: ForwardBufferBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<ForwardMode>('original')
  // Храним «снятые с выбора» id, а не выбранные: новые элементы буфера
  // выбраны по умолчанию, удалённые отпадают сами — без синхронизации в эффекте.
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set())

  const hasText = useMemo(() => items.some((i) => i.kind === 'text'), [items])
  const selectedItems = items.filter((i) => !deselected.has(i.id))

  if (items.length === 0) return null

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="border-t bg-muted/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Forward className="h-4 w-4 shrink-0 text-muted-foreground" />
        <button
          type="button"
          className="flex items-center gap-1 font-medium hover:opacity-80"
          onClick={() => setExpanded((v) => !v)}
        >
          К пересылке: {items.length}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {hasText && (
            <div className="flex h-7 items-center rounded-md bg-muted-foreground/[0.08] p-1 text-xs">
              {(['original', 'quote'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex h-full items-center rounded px-2 transition-colors',
                    mode === m
                      ? 'bg-background text-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m === 'original' ? 'Оригинал' : 'Цитата'}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            className="h-7 shadow-none"
            disabled={selectedItems.length === 0}
            onClick={() => onInsert(selectedItems, mode)}
          >
            Вставить{selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground/50 hover:text-destructive"
            onClick={onClear}
            aria-label="Очистить буфер"
            title="Очистить"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {items.map((item) => {
              const isSel = !deselected.has(item.id)
              return (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSel
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                    aria-label={isSel ? 'Снять выбор' : 'Выбрать'}
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </button>
                  {item.kind === 'file' && (
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-muted-foreground">{itemPreview(item)}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="ml-auto shrink-0 text-muted-foreground/60 hover:text-destructive"
                    aria-label="Убрать из буфера"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
