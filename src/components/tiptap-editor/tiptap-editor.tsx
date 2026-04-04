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
import { ColoredCode } from './extensions/colored-code'
import { BlockGapInserter } from './block-gap-inserter'
import { LinkPreviewPopup } from './link-preview-popup'
import { MenuBar } from './menu-bar'
import { cn } from '@/lib/utils'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/** Настройки загрузки изображений в Storage */
interface ImageUploadConfig {
  /** Workspace ID для пути в Storage */
  workspaceId: string
  /** ID статьи для пути в Storage */
  articleId: string
}

interface TiptapEditorProps {
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

  const { error } = await supabase.storage.from('files').upload(path, file)
  if (error) {
    console.error('[Image upload] Storage error:', error.message, error)
    throw error
  }

  const { data } = await supabase.storage.from('files').createSignedUrl(path, 60 * 60 * 24 * 365)
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- extensions не должны меняться после монтирования
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
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto my-2 shadow-sm',
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps -- hasImageUpload не должен меняться после монтирования
    ],
    [],
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
          '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6',
          '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5',
          '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4',
          '[&_p]:mb-2 [&_p]:leading-relaxed',
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
      handlePaste: (view, event) => {
        const config = imageUploadRef.current
        if (!config) return false
        const items = event.clipboardData?.items
        if (!items) return false
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
