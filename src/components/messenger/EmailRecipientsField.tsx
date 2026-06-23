/**
 * Поле выбора email-получателей: бейджи (chips) + ввод + выпадающий список
 * подсказок из контактов с поиском. Извлечено из инлайна `ChatSettingsChannels`,
 * чтобы переиспользовать в шапке email-треда (правка черновика).
 *
 * Самодостаточно: внутренний state ввода/дропдауна и фильтрация подсказок.
 * Наружу — только `value` (выбранные) + `onChange`.
 *
 * `singleSelect` — режим одного получателя (новый выбор заменяет прежний).
 * Нужен для треда: отправка письма берёт ОДИН адрес (email_last_external_address).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type EmailChip = { email: string; label: string }
export type EmailSuggestion = { email: string; label: string; freq?: number }

type Props = {
  value: EmailChip[]
  onChange: (next: EmailChip[]) => void
  suggestions: EmailSuggestion[]
  placeholder?: string
  singleSelect?: boolean
  className?: string
}

export function EmailRecipientsField({
  value,
  onChange,
  suggestions,
  placeholder = 'Email получателя',
  singleSelect = false,
  className,
}: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Закрытие списка по клику вне. Нужно особенно в single-select: после выбора
  // получателя инпут скрывается → его onBlur не сработает, список бы завис.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(() => {
    const selected = new Set(value.map((e) => e.email.toLowerCase()))
    const base = suggestions.filter((s) => !selected.has(s.email.toLowerCase()))
    const q = input.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (s) => s.email.toLowerCase().includes(q) || s.label.toLowerCase().includes(q),
    )
  }, [input, suggestions, value])

  const addChip = (chip: EmailChip) => {
    if (value.some((s) => s.email.toLowerCase() === chip.email.toLowerCase())) return
    onChange(singleSelect ? [chip] : [...value, chip])
    setInput('')
    setOpen(false)
  }

  const removeChip = (email: string) =>
    onChange(value.filter((e) => e.email.toLowerCase() !== email.toLowerCase()))

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <div
        className="flex flex-wrap items-center gap-1 min-h-[28px] px-2 py-1 rounded-md border bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((chip) => (
          <span
            key={chip.email}
            className="inline-flex items-center gap-1 max-w-[340px] rounded-md px-2 py-0.5 text-xs border"
            style={{
              backgroundColor: 'hsl(var(--brand-100))',
              borderColor: 'hsl(var(--brand-200))',
            }}
            title={chip.email}
          >
            <span className="truncate">
              {chip.label !== chip.email ? (
                <>
                  {chip.label}
                  <span className="text-muted-foreground/70"> · {chip.email}</span>
                </>
              ) : (
                chip.email
              )}
            </span>
            <button
              type="button"
              className="flex-shrink-0 rounded-sm hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                removeChip(chip.email)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {/* В single-select поле ввода прячем, когда получатель уже выбран —
            чтобы заменить, надо убрать бейдж. */}
        {!(singleSelect && value.length > 0) && (
          <input
            ref={inputRef}
            type="email"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !input && value.length > 0) {
                onChange(value.slice(0, -1))
              }
              if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
                e.preventDefault()
                const val = input.trim().replace(/,$/, '')
                if (val.includes('@')) {
                  const match = suggestions.find((s) => s.email.toLowerCase() === val.toLowerCase())
                  addChip({ email: val, label: match?.label ?? val })
                }
              }
            }}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground/40 text-sm"
            autoComplete="off"
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.map((s) => (
            <button
              key={s.email}
              type="button"
              className="w-full text-left px-2 py-1 text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault()
                addChip({ email: s.email, label: s.label })
                inputRef.current?.focus()
              }}
            >
              {s.label !== s.email ? (
                <>
                  <span className="truncate shrink-0 max-w-[40%]">{s.label}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1 text-right">
                    {s.email}
                  </span>
                </>
              ) : (
                <span className="truncate">{s.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
