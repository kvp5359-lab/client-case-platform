"use client"

import { NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Trash2 } from 'lucide-react'
import { type CalloutColor } from '../extensions/callout'

const LAST_EMOJI_KEY = 'callout_last_emoji'
const LAST_COLOR_KEY = 'callout_last_color'

const emojiOptions = [
  '💡',
  'ℹ️',
  '⚠️',
  '✅',
  '❌',
  '❓',
  '📝',
  '🔥',
  '🎯',
  '🚀',
  '💎',
  '⭐',
  '🔑',
  '📌',
  '🗂️',
  '📎',
  '🧠',
  '💬',
  '🛠️',
  '🔍',
  '📊',
  '📈',
  '🎉',
  '🙌',
  '👉',
  '👀',
  '🤔',
  '💯',
  '🚨',
  '🛑',
  '✏️',
  '📣',
  '🕐',
  '📅',
  '💰',
  '🧩',
  '🔗',
  '📞',
  '✉️',
  '🌍',
]

const colorOptions: { value: CalloutColor; label: string; previewClass: string }[] = [
  { value: 'gray', label: 'Серый', previewClass: 'bg-gray-300' },
  { value: 'blue', label: 'Синий', previewClass: 'bg-blue-300' },
  { value: 'green', label: 'Зелёный', previewClass: 'bg-green-300' },
  { value: 'yellow', label: 'Жёлтый', previewClass: 'bg-yellow-300' },
  { value: 'red', label: 'Красный', previewClass: 'bg-red-300' },
  { value: 'purple', label: 'Фиолетовый', previewClass: 'bg-purple-300' },
  { value: 'pink', label: 'Розовый', previewClass: 'bg-pink-300' },
]

const colorClasses: Record<CalloutColor, string> = {
  gray: 'bg-gray-100',
  blue: 'bg-blue-50',
  green: 'bg-green-50',
  yellow: 'bg-yellow-50',
  red: 'bg-red-50',
  purple: 'bg-purple-50',
  pink: 'bg-pink-50',
}

export function CalloutView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const icon = (node.attrs.icon as string) || ''
  const color = (node.attrs.color as CalloutColor) || 'blue'
  const [emojiOpen, setEmojiOpen] = useState(false)

  const handleEmojiSelect = (emoji: string) => {
    updateAttributes({ icon: emoji })
    localStorage.setItem(LAST_EMOJI_KEY, emoji)
    setEmojiOpen(false)
  }

  const handleColorSelect = (value: CalloutColor) => {
    updateAttributes({ color: value })
    localStorage.setItem(LAST_COLOR_KEY, value)
  }

  const handleClearIcon = () => {
    updateAttributes({ icon: '' })
    setEmojiOpen(false)
  }

  return (
    <NodeViewWrapper
      className={`my-4 not-prose ${selected ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
    >
      <div className="relative group">
        <div
          className={`flex items-start gap-2 rounded-lg ${colorClasses[color]}`}
          style={{ padding: '12px 20px 12px 12px' }}
        >
          {/* Icon picker */}
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex-shrink-0 hover:scale-110 transition-transform cursor-pointer h-6 w-6 flex items-center justify-center rounded hover:bg-black/5 mt-[2px]"
                title="Иконка"
              >
                {icon ? (
                  <span className="text-[20px] leading-none">{icon}</span>
                ) : (
                  <span className="text-lg text-muted-foreground/40">＋</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              {/* Цвет фона */}
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1.5">Цвет фона</p>
                <div className="flex gap-1.5">
                  {colorOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleColorSelect(opt.value)}
                      className={`w-6 h-6 rounded-full border-2 ${opt.previewClass} ${
                        color === opt.value ? 'border-primary' : 'border-transparent'
                      }`}
                      title={opt.label}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t mb-2.5" />

              {/* Кнопка «Без иконки» */}
              <button
                onClick={handleClearIcon}
                className={`w-full text-left text-xs px-1.5 py-1 rounded mb-1.5 hover:bg-muted transition-colors ${
                  !icon ? 'bg-muted font-medium' : 'text-muted-foreground'
                }`}
              >
                Без иконки
              </button>

              {/* Сетка эмодзи */}
              <div className="grid grid-cols-8 gap-0.5">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiSelect(emoji)}
                    className={`p-1.5 text-xl rounded hover:bg-muted transition-colors ${
                      icon === emoji ? 'bg-muted ring-1 ring-primary' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Content - editable */}
          <NodeViewContent className="callout-content flex-1 leading-relaxed focus:outline-none [&>p]:m-0" />
        </div>

        {/* Delete button */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={deleteNode}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
