"use client"

import { useRef } from 'react'

interface InlineColorPickerProps {
  value: string
  onChange: (color: string) => void
  title?: string
}

/** Простой инлайн-пикер цвета через нативный <input type="color"> */
export function InlineColorPicker({ value, onChange, title = 'Цвет' }: InlineColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <button
      type="button"
      title={title}
      className="w-7 h-7 rounded border border-border flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary hover:ring-offset-1 transition-all"
      style={{ backgroundColor: value }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="color"
        value={value}
        className="sr-only"
        onChange={(e) => onChange(e.target.value)}
      />
    </button>
  )
}
