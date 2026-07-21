"use client"

/**
 * Минималистичный Tiptap-редактор для мессенджера
 * Поддерживает: Bold, Italic, Underline, Strikethrough, Blockquote, OrderedList, BulletList
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent, type Editor, Extension } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { buildMentionExtension, type MentionItem } from './messengerMention'
import { MessengerLinkPopup, requestLinkEditor } from './messengerLinkPopup'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Quote,
  ListOrdered,
  List,
  Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToolbarButton } from '@/components/tiptap-editor/menu-bar/toolbar-button'

type MinimalTiptapEditorProps = {
  onSend: () => void
  /** «/» в пустом поле — открыть пикер быстрых ответов (кнопка-молния). */
  onSlash?: () => void
  onTyping?: () => void
  onPasteFiles?: (files: File[]) => void
  placeholder?: string
  editorRef: React.MutableRefObject<Editor | null>
  disabled?: boolean
  onEditorReady?: (editor: Editor | null) => void
  editorMaxHeight?: number
  /** Базовая (минимальная) высота поля редактора, px. По умолчанию 26 (~1 строка). */
  editorMinHeight?: number
  /** Участники для @-упоминаний (id = participant_id, label = имя). */
  mentionItems?: MentionItem[]
}

/**
 * Ссылка в мессенджере: non-inclusive — текст, набираемый сразу после ссылки,
 * НЕ становится её частью и не наследует её оформление. Дефолтный Link из
 * StarterKit возвращает inclusive = autolink (true), из-за чего текст «прилипал».
 */
const MessengerLink = Link.extend({ inclusive: () => false })

/** Кастомное расширение: Cmd/Ctrl+Enter = отправить, Enter/Shift+Enter = перенос строки */
const SendOnEnter = Extension.create({
  name: 'sendOnEnter',

  addOptions() {
    return { onSend: () => {}, onSlash: () => {} }
  },

  addKeyboardShortcuts() {
    // «/», «\» и «|» в ПУСТОМ поле открывают пикер быстрых ответов (как
    // кнопка-молния). Ловим в ProseMirror (событие приходит сюда раньше, чем
    // всплывает на React-обёртку) → надёжно гасим вставку символа и открываем
    // пикер. «|» = Shift+«\» — bind'им отдельно, т.к. keymap чувствителен к Shift.
    const openPicker = ({ editor }: { editor: Editor }) => {
      if (!editor.isEmpty) return false
      this.options.onSlash()
      return true
    }
    return {
      'Mod-Enter': () => {
        this.options.onSend()
        return true
      },
      'Shift-Enter': ({ editor }) => {
        // Мягкий перенос строки внутри текущего блока. Внутри списка НЕ
        // разрывает пункт (splitBlock рвал список на куски и ломал нумерацию).
        editor.commands.setHardBreak()
        return true
      },
      '/': openPicker,
      '\\': openPicker,
      '|': openPicker,
      'Shift-\\': openPicker,
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
    <div className="flex items-center gap-0 [&_button]:!px-1 [&_button]:!min-w-7 [&_button]:text-muted-foreground [&_button:hover]:text-foreground [&_button[data-state=on]]:!text-foreground [&_button[data-state=on]]:!bg-accent">
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
        icon={Link2}
        isActive={editor.isActive('link')}
        onAction={() => requestLinkEditor(editor)}
        title="Ссылка: прикрепить к выделенному / изменить / снять"
      />
      <ToolbarButton
        icon={Quote}
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
  onSlash,
  onTyping,
  onPasteFiles,
  placeholder = 'Введите сообщение...',
  editorRef,
  disabled = false,
  onEditorReady,
  editorMaxHeight,
  editorMinHeight,
  mentionItems,
}: MinimalTiptapEditorProps) {
  // Список участников для @-упоминаний читается через ref (extensions
  // инициализируются один раз, а список грузится асинхронно).
  const mentionItemsRef = useRef<MentionItem[]>(mentionItems ?? [])
  useEffect(() => {
    mentionItemsRef.current = mentionItems ?? []
  }, [mentionItems])
  // Всплывашка «изменить номер» — открывается кликом по цифре пункта
  // нумерованного списка. index — позиция кликнутого пункта внутри <ol>,
  // нужна чтобы пересчитать start (число первого пункта).
  const [numberPopover, setNumberPopover] = useState<{
    left: number
    top: number
    index: number
  } | null>(null)
  const [numberValue, setNumberValue] = useState('')
  // Позиция узла <ol> в документе ProseMirror (стабильна при смене только
  // атрибута start). Храним позицию, а НЕ DOM-элемент: после первого изменения
  // ProseMirror пересоздаёт <ol> и старая DOM-ссылка становится «мёртвой».
  const activeOlPosRef = useRef<number | null>(null)
  const numberPopoverRef = useRef<HTMLDivElement | null>(null)

  // Ref для onSend — SendOnEnter захватывает callback при создании,
  // ref гарантирует что Ctrl+Enter всегда вызовет актуальный handleSend
  const onSendRef = useRef(onSend)
  useEffect(() => {
    onSendRef.current = onSend
  }, [onSend])

  // Стабильная обёртка для передачи в extension (не читает ref при рендере)
  const stableSend = useCallback(() => onSendRef.current(), [])

  // Ref для onSlash — по той же причине (extension захватывает колбэк один раз).
  const onSlashRef = useRef(onSlash)
  useEffect(() => {
    onSlashRef.current = onSlash
  }, [onSlash])
  const stableSlash = useCallback(() => onSlashRef.current?.(), [])

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
        link: false,
      }),
      MessengerLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-blue-600 underline font-normal',
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({ placeholder }),
      // eslint-disable-next-line react-hooks/refs -- Tiptap extensions init once; stableSend reads ref only on keypress, not during render
      SendOnEnter.configure({ onSend: stableSend, onSlash: stableSlash }),
      // eslint-disable-next-line react-hooks/refs -- extension init once; getItems reads ref only on @-trigger
      buildMentionExtension(() => mentionItemsRef.current),
    ],
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none min-h-[26px] overflow-y-auto py-1 text-sm leading-snug break-words [overflow-wrap:anywhere]',
        style: `max-height: ${editorMaxHeight ?? 255}px${editorMinHeight ? `; min-height: ${editorMinHeight}px` : ''}`,
      },
      handlePaste: handlePasteImages,
    },
    onUpdate: () => {
      onTyping?.()
    },
  })

  // Клик по цифре пункта нумерованного списка → всплывашка «изменить номер».
  // Браузер отдаёт target = сам <li> при клике по ::marker (цифре/паддингу),
  // а при клике по тексту target = вложенный <p>. Так отличаем клик по цифре.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const dom = editor.view.dom as HTMLElement
    const handleClick = (e: MouseEvent) => {
      if (disabled) return
      const target = e.target as HTMLElement
      // Клик по цифре-маркеру: браузер отдаёт target = сам <li> (текст лежит во
      // вложенном <p>, по нему target = P). Но <li> занимает всю ширину строки,
      // поэтому клик в пустую зону СПРАВА от текста — тоже target = LI. Чтобы
      // ловить именно цифру, дополнительно требуем, чтобы клик был в левой зоне.
      if (target.tagName !== 'LI' || target.parentElement?.tagName !== 'OL') return
      const rect = target.getBoundingClientRect()
      const MARKER_ZONE_PX = 28
      if (e.clientX > rect.left + MARKER_ZONE_PX) return
      const ol = target.parentElement as HTMLOListElement
      const items = Array.from(ol.children).filter(
        (c) => c.tagName === 'LI',
      ) as HTMLLIElement[]
      const index = items.indexOf(target as HTMLLIElement)
      // start читаем из DOM (tiptap пишет атрибут только при start≠1) — без
      // обращения к выделению, поэтому ничего не бросает.
      const start = parseInt(ol.getAttribute('start') ?? '1', 10) || 1
      // Запоминаем позицию узла <ol> в документе (живой элемент → позиция).
      activeOlPosRef.current = null
      try {
        const posInside = editor.view.posAtDOM(ol, 0)
        const $pos = editor.state.doc.resolve(posInside)
        let depth = $pos.depth
        while (depth > 0 && $pos.node(depth).type.name !== 'orderedList') depth--
        if ($pos.node(depth).type.name === 'orderedList') {
          activeOlPosRef.current = $pos.before(depth)
        }
      } catch {
        // не разрешилось — оставим null, applyNumber просто ничего не сделает
      }
      setNumberValue(String(start + index))
      setNumberPopover({ left: rect.left, top: rect.top, index })
    }
    dom.addEventListener('click', handleClick)
    return () => dom.removeEventListener('click', handleClick)
  }, [editor, disabled])

  // Закрытие всплывашки «Номер пункта» по клику снаружи. Слушатель вешается
  // в useEffect (после коммита рендера), поэтому открывающий клик его не ловит —
  // иначе подложка-оверлей закрывала всплывашку тем же кликом, что и открыл.
  useEffect(() => {
    if (!numberPopover) return
    const onDown = (e: MouseEvent) => {
      if (numberPopoverRef.current && !numberPopoverRef.current.contains(e.target as Node)) {
        setNumberPopover(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [numberPopover])

  // Применяет новый номер кликнутого пункта, пересчитывая start всего списка.
  // Меняем атрибут конкретного узла <ol> транзакцией по его позиции в документе,
  // не трогая выделение (надёжно при клике по маркеру-цифре).
  const applyNumber = useCallback(
    (raw: string) => {
      setNumberValue(raw)
      const n = parseInt(raw, 10)
      const olPos = activeOlPosRef.current
      if (Number.isNaN(n) || !numberPopover || !editor || olPos == null) return
      const value = Math.max(1, n)
      const idx = numberPopover.index
      try {
        // Узел берём заново по позиции на каждое изменение (DOM-ссылка протухает).
        const node = editor.state.doc.nodeAt(olPos)
        if (!node || node.type.name !== 'orderedList') return

        if (idx <= 0) {
          // Кликнут первый пункт — предыдущих нет, просто задаём start всему списку.
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(olPos, undefined, { ...node.attrs, start: value }),
          )
          return
        }

        // Кликнут не первый пункт: разрываем список. Пункты [0..idx-1] остаются
        // в исходном <ol> со своей нумерацией; пункты [idx..] переезжают в новый
        // <ol start=value> — так предыдущие номера не меняются, а последующие
        // пересчитываются от нового значения.
        const before: ProseMirrorNode[] = []
        const after: ProseMirrorNode[] = []
        node.forEach((child, _offset, i) => {
          ;(i < idx ? before : after).push(child)
        })
        const firstOl = node.type.create(node.attrs, before)
        const secondOl = node.type.create({ ...node.attrs, start: value }, after)
        editor.view.dispatch(
          editor.state.tr.replaceWith(olPos, olPos + node.nodeSize, [firstOl, secondOl]),
        )
        // Теперь правим уже второй список, в котором кликнутый пункт стал первым.
        activeOlPosRef.current = olPos + firstOl.nodeSize
        setNumberPopover((p) => (p ? { ...p, index: 0 } : p))
      } catch {
        // узел переехал — тихо пропускаем
      }
    },
    [editor, numberPopover],
  )

  // Синхронизация editable с disabled
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(!disabled)
    }
  }, [editor, disabled])

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
            'prose prose-sm max-w-none focus:outline-none min-h-[26px] overflow-y-auto py-1 text-sm leading-snug break-words [overflow-wrap:anywhere]',
          style: `max-height: ${editorMaxHeight ?? 255}px${editorMinHeight ? `; min-height: ${editorMinHeight}px` : ''}`,
        },
        handlePaste: handlePasteImages,
      },
    })
  }, [editor, editorMaxHeight, editorMinHeight, handlePasteImages])

  if (!editor) return null

  return (
    <>
      <EditorContent
        editor={editor}
        className={cn('messenger-editor', disabled && 'opacity-50 pointer-events-none')}
      />
      <MessengerLinkPopup editor={editor} />
      {numberPopover &&
        typeof document !== 'undefined' &&
        createPortal(
          // Портал в body: иначе position:fixed считается от трансформированного
          // предка-композера и всплывашку уносит за экран.
          <div
            ref={numberPopoverRef}
            className="fixed z-[1000] flex items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md"
            style={{
              left: numberPopover.left,
              top: Math.max(8, numberPopover.top - 44),
            }}
          >
            <span className="text-muted-foreground whitespace-nowrap">Номер пункта</span>
            <input
              autoFocus
              type="number"
              min={1}
              value={numberValue}
              onChange={(e) => applyNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault()
                  setNumberPopover(null)
                }
              }}
              className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>,
          document.body,
        )}
    </>
  )
}
