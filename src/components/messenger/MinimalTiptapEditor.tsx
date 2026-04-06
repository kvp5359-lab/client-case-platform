"use client"

/**
 * Минималистичный Tiptap-редактор для мессенджера
 * Поддерживает: Bold, Italic, Underline, Strikethrough, Blockquote, OrderedList, BulletList
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, type Editor, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  MessageSquareQuote,
  ListOrdered,
  List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolbarButton } from '@/components/tiptap-editor/menu-bar/toolbar-button'

interface MinimalTiptapEditorProps {
  onSend: () => void
  onTyping?: () => void
  onPasteFiles?: (files: File[]) => void
  placeholder?: string
  editorRef: React.MutableRefObject<Editor | null>
  disabled?: boolean
  onEditorReady?: (editor: Editor | null) => void
  editorMaxHeight?: number
}

/** Кастомное расширение: Cmd/Ctrl+Enter = отправить, Enter/Shift+Enter = перенос строки */
const SendOnEnter = Extension.create({
  name: 'sendOnEnter',

  addOptions() {
    return { onSend: () => {} }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        this.options.onSend()
        return true
      },
      'Shift-Enter': ({ editor }) => {
        editor.commands.splitBlock()
        return true
      },
    }
  },
})

/** Тулбар форматирования — выносится отдельно для размещения в нижнем ряду */
export function MessengerToolbar({ editor }: { editor: Editor }) {
  // Форсируем ререндер при каждой транзакции (toggle bold/italic/etc)
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1)
    editor.on('transaction', handler)
    return () => {
      editor.off('transaction', handler)
    }
  }, [editor])
  return (
    <div className="flex items-center gap-0.5 [&_button]:text-muted-foreground [&_button:hover]:text-foreground [&_button[data-state=on]]:!text-foreground [&_button[data-state=on]]:!bg-accent">
      <ToolbarButton
        icon={Bold}
        isActive={editor.isActive('bold')}
        onAction={() => editor.chain().focus().toggleBold().run()}
        title="Жирный (Ctrl+B)"
      />
      <ToolbarButton
        icon={Italic}
        isActive={editor.isActive('italic')}
        onAction={() => editor.chain().focus().toggleItalic().run()}
        title="Курсив (Ctrl+I)"
      />
      <ToolbarButton
        icon={UnderlineIcon}
        isActive={editor.isActive('underline')}
        onAction={() => editor.chain().focus().toggleUnderline().run()}
        title="Подчёркнутый (Ctrl+U)"
      />
      <ToolbarButton
        icon={Strikethrough}
        isActive={editor.isActive('strike')}
        onAction={() => editor.chain().focus().toggleStrike().run()}
        title="Зачёркнутый (Ctrl+Shift+S)"
      />
      <ToolbarButton
        icon={MessageSquareQuote}
        isActive={editor.isActive('blockquote')}
        onAction={() => editor.chain().focus().toggleBlockquote().run()}
        title="Цитата"
      />
      <ToolbarButton
        icon={ListOrdered}
        isActive={editor.isActive('orderedList')}
        onAction={() => editor.chain().focus().toggleOrderedList().run()}
        title="Нумерованный список"
      />
      <ToolbarButton
        icon={List}
        isActive={editor.isActive('bulletList')}
        onAction={() => editor.chain().focus().toggleBulletList().run()}
        title="Маркированный список"
      />
    </div>
  )
}

export function MinimalTiptapEditor({
  onSend,
  onTyping,
  onPasteFiles,
  placeholder = 'Введите сообщение...',
  editorRef,
  disabled = false,
  onEditorReady,
  editorMaxHeight,
}: MinimalTiptapEditorProps) {
  // Ref для onSend — SendOnEnter захватывает callback при создании,
  // ref гарантирует что Ctrl+Enter всегда вызовет актуальный handleSend
  const onSendRef = useRef(onSend)
  useEffect(() => {
    onSendRef.current = onSend
  }, [onSend])

  // Стабильная обёртка для передачи в extension (не читает ref при рендере)
  const stableSend = useCallback(() => onSendRef.current(), [])

  // Ref для onPasteFiles — чтобы editorProps.handlePaste всегда видел актуальный callback
  const onPasteFilesRef = useRef(onPasteFiles)
  useEffect(() => {
    onPasteFilesRef.current = onPasteFiles
  }, [onPasteFiles])

  /** Извлекает изображения из clipboardData и передаёт в onPasteFiles */
  const handlePasteImages = useCallback(
    (_view: unknown, event: ClipboardEvent) => {
      const handler = onPasteFilesRef.current
      if (!handler) return false
      const items = event.clipboardData?.items
      if (!items) return false
      const imageFiles: File[] = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const ext = file.type.split('/')[1] || 'png'
          const uniqueName = `screenshot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
          const renamed = new File([file], uniqueName, { type: file.type })
          imageFiles.push(renamed)
        }
      }
      if (imageFiles.length > 0) {
        handler(imageFiles)
        return true
      }
      return false
    },
    [],
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        code: false,
      }),
      Placeholder.configure({ placeholder }),
      // eslint-disable-next-line react-hooks/refs -- Tiptap extensions init once; stableSend reads ref only on keypress, not during render
      SendOnEnter.configure({ onSend: stableSend }),
    ],
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[36px] overflow-y-auto py-2 text-sm leading-snug',
        style: `max-height: ${editorMaxHeight ?? 255}px`,
      },
      handlePaste: handlePasteImages,
    },
    onUpdate: () => {
      onTyping?.()
    },
  })

  // Привязка editorRef + уведомление родителя
  useEffect(() => {
    editorRef.current = editor
    onEditorReady?.(editor)
    return () => {
      editorRef.current = null
      onEditorReady?.(null)
    }
  }, [editor, editorRef, onEditorReady])

  // Обновление max-height редактора при изменении editorMaxHeight
  useEffect(() => {
    if (!editor) return
    editor.setOptions({
      editorProps: {
        attributes: {
          class:
            'prose prose-sm max-w-none focus:outline-none min-h-[36px] overflow-y-auto py-2 text-sm leading-snug',
          style: `max-height: ${editorMaxHeight ?? 255}px`,
        },
        handlePaste: handlePasteImages,
      },
    })
  }, [editor, editorMaxHeight, handlePasteImages])

  if (!editor) return null

  return (
    <EditorContent
      editor={editor}
      className={cn('messenger-editor', disabled && 'opacity-50 pointer-events-none')}
    />
  )
}
