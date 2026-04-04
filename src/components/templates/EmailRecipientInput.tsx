/**
 * Поле для ввода email-получателей с chips и dropdown-подсказками.
 * Поддерживает: добавление через Enter/запятую, удаление через Backspace/крестик,
 * выбор из списка участников workspace.
 * Используется в ThreadTemplateDialog (только для режима email).
 */

import { useRef } from 'react'
import { X } from 'lucide-react'

export interface EmailChip {
  email: string
  label: string
}

interface EmailRecipientInputProps {
  chips: EmailChip[]
  inputValue: string
  dropdownOpen: boolean
  suggestions: EmailChip[]
  onInputChange: (value: string) => void
  onDropdownOpenChange: (open: boolean) => void
  onAddChip: (chip: EmailChip) => void
  onRemoveChip: (email: string) => void
  onRemoveLast: () => void
}

export function EmailRecipientInput({
  chips,
  inputValue,
  dropdownOpen,
  suggestions,
  onInputChange,
  onDropdownOpenChange,
  onAddChip,
  onRemoveChip,
  onRemoveLast,
}: EmailRecipientInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      onRemoveLast()
    }
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      const val = inputValue.trim().replace(/,$/, '')
      if (val.includes('@') && !chips.some((s) => s.email.toLowerCase() === val.toLowerCase())) {
        const match = suggestions.find((s) => s.email.toLowerCase() === val.toLowerCase())
        onAddChip({ email: val, label: match?.label ?? val })
      }
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1 min-h-[36px] px-3 py-1 rounded-md border bg-background text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip) => (
          <span
            key={chip.email}
            className="inline-flex items-center gap-1 max-w-[220px] rounded-md px-2 py-0.5 text-xs border"
            style={{
              backgroundColor: 'hsl(var(--brand-100))',
              borderColor: 'hsl(var(--brand-200))',
            }}
            title={chip.email}
          >
            <span className="truncate">{chip.label !== chip.email ? chip.label : chip.email}</span>
            <button
              type="button"
              className="flex-shrink-0 rounded-sm hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveChip(chip.email)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="email"
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value)
            onDropdownOpenChange(true)
          }}
          onFocus={() => onDropdownOpenChange(true)}
          onBlur={() => setTimeout(() => onDropdownOpenChange(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={chips.length === 0 ? 'example@email.com' : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground/40 text-sm"
          autoComplete="off"
        />
      </div>
      {dropdownOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.email}
              type="button"
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent cursor-pointer flex flex-col"
              onMouseDown={(e) => {
                e.preventDefault()
                onAddChip({ email: s.email, label: s.label })
                inputRef.current?.focus()
              }}
            >
              {s.label !== s.email ? (
                <>
                  <span className="truncate">{s.label}</span>
                  <span className="text-xs text-muted-foreground truncate">{s.email}</span>
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
