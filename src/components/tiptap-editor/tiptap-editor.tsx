"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import { undo, redo } from '@tiptap/pm/history'
import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextAlign } from '@tiptap/extension-text-align'
import { Highlight } from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Image } from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Callout } from './extensions/callout'
import { Accordion } from './extensions/accordion'
import { Columns, Column } from './extensions/columns'
import { ImageBlock } from './extensions/image-block'
import { ImageSpoiler } from './extensions/image-spoiler'
import { ColoredCode } from './extensions/colored-code'
import { BlockGapInserter } from './block-gap-inserter'
import { LinkPreviewPopup } from './link-preview-popup'
import { MenuBar } from './menu-bar'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { STORAGE_BUCKETS, createStorageSignedUrl, uploadToStorage } from '@/lib/storage'
import { toast } from 'sonner'

/** Настройки загрузки изображений в Storage */
type ImageUploadConfig = {
  /** Workspace ID для пути в Storage */
  workspaceId: string
  /** ID статьи для пути в Storage */
  articleId: string
}

type TiptapEditorProps = {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
  editorClassName?: string
  showMenuBar?: boolean
  minHeight?: string
  /** Если передан — включает загрузку изображений через paste/drop */
  imageUpload?: ImageUploadConfig
}

async function uploadImageToStorage(file: File, config: ImageUploadConfig): Promise<string> {
  const ext = file.name.split('.').pop() || 'png'
  const uuid = crypto.randomUUID()
  const path = `${config.workspaceId}/knowledge/${config.articleId}/${uuid}.${ext}`

  const { error } = await uploadToStorage(STORAGE_BUCKETS.files, path, file)
  if (error) {
    logger.error('[Image upload] Storage error:', error.message, error)
    throw error
  }

  const { data } = await createStorageSignedUrl(STORAGE_BUCKETS.files, path, 60 * 60 * 24 * 365)
  if (!data?.signedUrl) throw new Error('Не удалось получить URL изображения')
  return data.signedUrl
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = 'Начните писать...',
  className,
  editorClassName,
  showMenuBar = true,
  minHeight = '200px',
  imageUpload,
}: TiptapEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const imageUploadRef = useRef(imageUpload)
  useEffect(() => {
    imageUploadRef.current = imageUpload
  }, [imageUpload])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

   
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        strike: false,
        link: false,
        code: false,
      }),
      ColoredCode,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Callout,
      Accordion,
      Columns,
      Column,
      ImageBlock,
      ImageSpoiler,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto my-2 shadow-sm',
        },
      }),
       
    ],
    [placeholder],
  )

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions,
    content,
    editorProps: {
      attributes: {
        class: cn(
          // Базовые стили prose (без @tailwindcss/typography)
          'focus:outline-none p-4',
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-3',
          '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3',
          '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3',
          '[&_p]:mb-1.5 [&_p]:leading-normal',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
          '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
          '[&_li]:mb-0 [&_li_p]:mb-0',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
          '[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:bg-[#F3F4F6]',
          '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto',
          '[&_hr]:my-6 [&_hr]:border-border',
          '[&_a]:text-primary [&_a]:underline',
          '[&_table]:w-full [&_table]:border-collapse [&_table]:my-4',
          '[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left',
          '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
          '[&_th_p]:mb-0 [&_td_p]:mb-0',
          '[&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto [&_img]:my-2 [&_img]:[box-shadow:0_0_14px_rgba(0,0,0,0.15)]',
          '[&_.ProseMirror-selectednode]:outline [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-primary',
          editorClassName,
        ),
        style: `min-height: ${minHeight}`,
      },
      // Notion/Confluence отдают строки как <div>...</div> без <p>, и Tiptap
      // схлопывает всё в один параграф. Приводим <div>/<br> к <p>, чтобы
      // строки превращались в отдельные параграфы.
      transformPastedHTML: (html: string) => {
        if (!html) return html

        // Notion отдаёт глубоко вложенные <div> без <p>/<br>. Каждый блок —
        // <div data-block-id ... class="notion-..._list-block"> с 5-6 уровнями
        // вложенных div внутри. Прямое <div>→<p> плодило бы пустые параграфы.
        // Разбираем DOM и собираем чистый HTML из листовых блоков.
        if (typeof window !== 'undefined' && /notion-selectable|data-block-id=/.test(html)) {
          try {
            const doc = new DOMParser().parseFromString(html, 'text/html')
            const blocks = Array.from(doc.querySelectorAll('[data-block-id]'))
            if (blocks.length > 0) {
              const parts: string[] = []
              let listType: 'ul' | 'ol' | null = null
              let items: string[] = []
              const flush = () => {
                if (items.length && listType) parts.push(`<${listType}>${items.join('')}</${listType}>`)
                items = []
                listType = null
              }
              for (const block of blocks) {
                // пропускаем блоки-контейнеры с вложенными блоками — берём только листья
                if (block.querySelector('[data-block-id]')) continue
                const leaf = block.querySelector('[data-content-editable-leaf="true"]')
                const inner = (leaf?.innerHTML ?? block.textContent ?? '').trim()
                if (!inner) continue
                const cls = block.className || ''
                if (/numbered_list-block/.test(cls)) {
                  if (listType && listType !== 'ol') flush()
                  listType = 'ol'
                  items.push(`<li>${inner}</li>`)
                } else if (/bulleted_list-block|to_do-block|toggle-block/.test(cls)) {
                  if (listType && listType !== 'ul') flush()
                  listType = 'ul'
                  items.push(`<li>${inner}</li>`)
                } else {
                  flush()
                  parts.push(/header.*-block/.test(cls) ? `<p><strong>${inner}</strong></p>` : `<p>${inner}</p>`)
                }
              }
              flush()
              if (parts.length > 0) return parts.join('')
            }
          } catch {
            // если разбор не удался — падаем в общий путь ниже
          }
        }

        let out = html
        // Прочие источники: вырезаем пустые блоки <p>/<div> (вертикальные отступы).
        const emptyBlock = /<(p|div)\b[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/\1>/gi
        out = out.replace(emptyBlock, '').replace(emptyBlock, '')
        // Если остались <p> — построчная структура сохранена, дальше не трогаем.
        if (/<p\b/i.test(out)) return out
        // <br><br> → конец параграфа + новый параграф
        out = out.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>')
        // одиночный <br> → новый параграф (для построчных вставок)
        out = out.replace(/<br\s*\/?>/gi, '</p><p>')
        // <div>...</div> → <p>...</p>
        out = out.replace(/<div(\s[^>]*)?>/gi, '<p>').replace(/<\/div>/gi, '</p>')
        return out
      },
      handlePaste: (view, event) => {
        // 1) изображения через clipboard → ImageBlock
        const config = imageUploadRef.current
        const items = event.clipboardData?.items
        if (config && items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (!file) return false
              const saved = (() => {
                try {
                  return JSON.parse(localStorage.getItem('imageBlock:lastStyle') || '{}')
                } catch {
                  return {}
                }
              })()
              uploadImageToStorage(file, config)
                .then((url) => {
                  const { state, dispatch } = view
                  const node = state.schema.nodes.imageBlock.create({
                    src: url,
                    alt: file.name,
                    rounded: saved.rounded || 'lg',
                    borderWidth: saved.borderWidth || 'none',
                    borderColor: saved.borderColor || '#d1d5db',
                    shadow: saved.shadow || 'none',
                  })
                  dispatch(state.tr.replaceSelectionWith(node))
                })
                .catch(() => toast.error('Не удалось загрузить изображение'))
              return true
            }
          }
        }

        // 2) Если plain-text имеет переводы строк, а HTML их не отражает
        //    (нет <p>/<br>/<div>, или всего один <p>) — приоритет за plain-text.
        //    Источники: Notion часто отдаёт «слипшийся» HTML + переносы только в text/plain.
        const html = event.clipboardData?.getData('text/html') || ''
        const text = event.clipboardData?.getData('text/plain') || ''
        if (text.includes('\n')) {
          const lineCount = text.split(/\r?\n/).filter((s) => s.trim()).length
          const pCount = (html.match(/<p\b/gi) || []).length
          const brCount = (html.match(/<br\b/gi) || []).length
          const divCount = (html.match(/<div\b/gi) || []).length
          const htmlReflectsLines = pCount > 1 || brCount > 0 || divCount > 1
          if (lineCount > 1 && !htmlReflectsLines) {
            event.preventDefault()
            const lines = text.split(/\r?\n/)
            const { state, dispatch } = view
            const { schema } = state
            const paragraphs = lines.map((line) => {
              const t = line.trim()
              return schema.nodes.paragraph.create(null, t ? schema.text(t) : null)
            })
            // tr.insert(pos, node) НЕ двигает selection.from — цикл с одной
            // позицией вставлял каждый следующий параграф ПЕРЕД предыдущим
            // (обратный порядок). Передаём массив одним insert — ProseMirror
            // сам разложит ноды подряд начиная от позиции.
            const tr = state.tr.deleteSelection()
            tr.insert(tr.selection.from, paragraphs)
            dispatch(tr)
            return true
          }
        }

        return false
      },
      handleDrop: (view, event) => {
        const config = imageUploadRef.current
        if (!config) return false
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
        if (imageFiles.length === 0) return false
        event.preventDefault()
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from
        const saved = (() => {
          try {
            return JSON.parse(localStorage.getItem('imageBlock:lastStyle') || '{}')
          } catch {
            return {}
          }
        })()
        for (const file of imageFiles) {
          uploadImageToStorage(file, config)
            .then((url) => {
              const { state, dispatch } = view
              const node = state.schema.nodes.imageBlock.create({
                src: url,
                alt: file.name,
                rounded: saved.rounded || 'lg',
                borderWidth: saved.borderWidth || 'none',
                borderColor: saved.borderColor || '#d1d5db',
                shadow: saved.shadow || 'none',
              })
              dispatch(state.tr.insert(pos, node))
            })
            .catch(() => toast.error('Не удалось загрузить изображение'))
        }
        return true
      },
      handleKeyDown: (view, event) => {
        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
        const modKey = isMac ? event.metaKey : event.ctrlKey

        if (modKey && event.key === 'z' && !event.shiftKey) {
          event.preventDefault()
          undo(view.state, view.dispatch)
          return true
        } else if (modKey && event.key === 'z' && event.shiftKey) {
          event.preventDefault()
          redo(view.state, view.dispatch)
          return true
        } else if (modKey && event.key === 'y' && !isMac) {
          event.preventDefault()
          redo(view.state, view.dispatch)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // Global undo/redo handler with capture phase to intercept before browser
  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Check if editor is focused
      const editorElement = document.querySelector('.ProseMirror')
      if (
        !editorElement?.contains(document.activeElement) &&
        document.activeElement !== editorElement
      ) {
        return
      }

      if (modKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        editor.chain().focus().undo().run()
      } else if (modKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        editor.chain().focus().redo().run()
      } else if (modKey && e.key === 'y' && !isMac) {
        e.preventDefault()
        e.stopPropagation()
        editor.chain().focus().redo().run()
      }
    }

    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [editor])

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden bg-white dark:bg-background flex flex-col',
        isFullscreen && 'fixed inset-0 z-50 rounded-none border-none',
        className,
      )}
    >
      {showMenuBar && (
        <MenuBar
          editor={editor}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onImageUpload={
            imageUpload
              ? async (file) => {
                  try {
                    return await uploadImageToStorage(file, imageUpload)
                  } catch {
                    toast.error('Не удалось загрузить изображение')
                    throw new Error('upload failed')
                  }
                }
              : undefined
          }
        />
      )}
      <div className="flex-1 overflow-auto min-h-0">
        <div className={cn('relative', isFullscreen && 'max-w-4xl mx-auto')}>
          <EditorContent editor={editor} />
          <BlockGapInserter editor={editor} />
          {editor && <LinkPreviewPopup editor={editor} />}
        </div>
      </div>
    </div>
  )
}
