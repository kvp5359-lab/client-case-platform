'use client'

/**
 * Поле поиска базы знаний с выпадающей историей.
 * Значение контролируется снаружи; история берётся из useSearchHistory.
 */

import { useRef, useState } from 'react'
import { Search, X, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useSearchHistory } from '@/hooks/knowledge/useKnowledgeSearch'

export function KnowledgeSearchInput({
  value,
  onChange,
  historyScope,
  placeholder = 'Поиск...',
  className,
  inputClassName,
}: {
  value: string
  onChange: (v: string) => void
  historyScope: string
  placeholder?: string
  className?: string
  inputClassName?: string
}) {
  const { history, commit, remove, clear } = useSearchHistory(historyScope)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = value.trim().toLowerCase()
  const suggestions = q
    ? history.filter((h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q)
    : history

  const showList = open && suggestions.length > 0

  const pick = (v: string) => {
    onChange(v)
    commit(v)
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'Enter') {
      if (showList && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault()
        pick(suggestions[activeIndex])
      } else if (value.trim()) {
        commit(value)
        setOpen(false)
      }
      return
    }
    if (!showList) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        placeholder={placeholder}
        className={cn('pl-9', value ? 'pr-8' : '', inputClassName)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // отложенно — чтобы клик по элементу истории успел сработать
          blurTimer.current = setTimeout(() => {
            if (value.trim()) commit(value)
            setOpen(false)
            setActiveIndex(-1)
          }, 150)
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          title="Очистить"
          onClick={() => onChange('')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {showList && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border bg-popover shadow-md py-1 max-h-64 overflow-y-auto"
          onMouseDown={(e) => {
            // не дать инпуту потерять фокус до обработки клика
            e.preventDefault()
            if (blurTimer.current) clearTimeout(blurTimer.current)
          }}
        >
          <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
            <span>История поиска</span>
            <button type="button" className="hover:text-foreground" onClick={clear}>
              Очистить всё
            </button>
          </div>
          {suggestions.map((h, i) => (
            <div
              key={h}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer',
                i === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
              )}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => pick(h)}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate flex-1">{h}</span>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-destructive flex-shrink-0"
                title="Убрать из истории"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(h)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
