"use client"

/**
 * Поле ввода комментария
 */

import { useState, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CommentInputProps {
  onSubmit: (content: string) => void
  onCancel?: () => void
  placeholder?: string
  initialValue?: string
  isLoading?: boolean
  autoFocus?: boolean
}

export function CommentInput({
  onSubmit,
  onCancel,
  placeholder = 'Написать комментарий...',
  initialValue = '',
  isLoading = false,
  autoFocus = false,
}: CommentInputProps) {
  const [content, setContent] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed || isLoading) return
    onSubmit(trimmed)
    setContent('')
  }, [content, isLoading, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape' && onCancel) {
        onCancel()
      }
    },
    [handleSubmit, onCancel],
  )

  return (
    <div className="flex items-end gap-1.5">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px] max-h-[120px]"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 shrink-0"
        onClick={handleSubmit}
        disabled={!content.trim() || isLoading}
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
