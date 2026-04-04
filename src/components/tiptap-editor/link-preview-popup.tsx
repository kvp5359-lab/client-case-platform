"use client"

/**
 * LinkPreviewPopup — Notion-style всплывающий попап при клике на ссылку в редакторе.
 *
 * Появляется под ссылкой когда курсор внутри неё. Позволяет:
 * - Перейти по ссылке
 * - Изменить URL
 * - Удалить ссылку
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { type Editor } from '@tiptap/react'
import { ExternalLink, Pencil, Unlink, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface LinkPreviewPopupProps {
  editor: Editor
}

interface PopupState {
  href: string
  top: number
  left: number
}

export function LinkPreviewPopup({ editor }: LinkPreviewPopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editUrl, setEditUrl] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updatePopup = useCallback(() => {
    const { state } = editor
    const { from } = state.selection

    const linkMark = state.schema.marks.link
    if (!linkMark) {
      setPopup(null)
      return
    }

    const resolved = state.doc.resolve(from)
    const marks = resolved.marks()
    const mark = marks.find((m) => m.type === linkMark)

    if (!mark) {
      setPopup(null)
      setIsEditing(false)
      return
    }

    const href = mark.attrs.href as string

    // Получаем DOM-позицию курсора
    const domPos = editor.view.domAtPos(from)
    const node = domPos.node instanceof Element ? domPos.node : domPos.node.parentElement
    if (!node) {
      setPopup(null)
      return
    }

    const rect = node.getBoundingClientRect()
    const editorRect = editor.view.dom.getBoundingClientRect()

    setPopup({
      href,
      top: rect.bottom - editorRect.top + editor.view.dom.scrollTop + 4,
      left: rect.left - editorRect.left,
    })
    setEditUrl(href)
  }, [editor])

  useEffect(() => {
    const handler = () => updatePopup()
    editor.on('selectionUpdate', handler)
    editor.on('blur', () => {
      // Задержка чтобы не закрыться при клике на кнопки попапа
      setTimeout(() => {
        if (!containerRef.current?.contains(document.activeElement)) {
          setPopup(null)
          setIsEditing(false)
        }
      }, 150)
    })
    return () => {
      editor.off('selectionUpdate', handler)
    }
  }, [editor, updatePopup])

  // Программный фокус + выделение при входе в режим редактирования
  // (autoFocus ненадёжен, а onMouseDown preventDefault на контейнере мешал фокусу)
  useEffect(() => {
    if (isEditing) {
      // RAF гарантирует, что input уже в DOM после ре-рендера
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isEditing])

  const handleSaveUrl = useCallback(() => {
    if (editUrl.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: editUrl.trim() }).run()
    }
    setIsEditing(false)
    updatePopup()
  }, [editor, editUrl, updatePopup])

  const handleRemove = useCallback(() => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setPopup(null)
    setIsEditing(false)
  }, [editor])

  if (!popup) return null

  return (
    <div
      ref={containerRef}
      className="absolute z-50 flex items-center gap-1 bg-popover border border-border rounded-md shadow-md px-2 py-1.5 text-sm"
      style={{ top: popup.top, left: popup.left }}
      onMouseDown={(e) => {
        // Не блокировать фокус для input — иначе Ctrl+A/Cmd+A и клик в input не работают
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT') return
        e.preventDefault()
      }}
    >
      {isEditing ? (
        <>
          <Input
            ref={inputRef}
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSaveUrl()
              }
              if (e.key === 'Escape') {
                setIsEditing(false)
                setEditUrl(popup.href)
              }
            }}
            className="h-6 text-sm w-64 px-2"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Сохранить"
            onMouseDown={(e) => {
              e.preventDefault()
              handleSaveUrl()
            }}
          >
            <Check className="w-3.5 h-3.5 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Отмена"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsEditing(false)
              setEditUrl(popup.href)
            }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </>
      ) : (
        <>
          <a
            href={popup.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline max-w-[240px] truncate hover:text-primary/80"
            title={popup.href}
          >
            {popup.href}
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-1"
            title="Открыть ссылку"
            onMouseDown={(e) => {
              e.preventDefault()
              window.open(popup.href, '_blank', 'noopener,noreferrer')
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Изменить ссылку"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsEditing(true)
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Удалить ссылку"
            onMouseDown={(e) => {
              e.preventDefault()
              handleRemove()
            }}
          >
            <Unlink className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </>
      )}
    </div>
  )
}
