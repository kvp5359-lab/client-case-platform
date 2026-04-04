"use client"

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2 } from 'lucide-react'
import type { AccentColor } from './KnowledgeChatMessage'

const sendButtonStyles: Record<AccentColor, string> = {
  blue: 'bg-blue-500 hover:bg-blue-600 text-white',
  green: 'bg-green-600 hover:bg-green-700 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 text-white',
  purple: 'bg-purple-600 hover:bg-purple-700 text-white',
}

interface KnowledgeChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  placeholder?: string
  accent?: AccentColor
}

export function KnowledgeChatInput({
  onSend,
  isLoading,
  placeholder,
  accent = 'green',
}: KnowledgeChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setInput('')
    textareaRef.current?.focus()
  }, [input, isLoading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex gap-2 items-end px-4 pb-4 pt-2 bg-background">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? 'Задайте вопрос по базе знаний...'}
        className="min-h-[44px] max-h-[120px] resize-none"
        rows={1}
        disabled={isLoading}
      />
      <Button
        onClick={handleSend}
        disabled={!input.trim() || isLoading}
        size="icon"
        className={cn(sendButtonStyles[accent])}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  )
}
