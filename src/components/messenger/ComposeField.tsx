/**
 * ComposeField — переиспользуемый компонент ввода контента.
 * Tiptap-редактор + тулбар форматирования + прикрепление файлов + чипы файлов.
 * Без привязки к чатам, тредам, reply, edit, draft.
 *
 * Используется в: MessageInput (мессенджер), ChatSettingsDialog (первое сообщение).
 */

import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { X, type LucideIcon } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { MinimalTiptapEditor, MessengerToolbar } from './MinimalTiptapEditor'
import { AttachmentButton } from './AttachmentButton'
import { QuickReplyPicker } from './QuickReplyPicker'
import { ImageLightbox } from './ImageLightbox'
import { getAttachmentUrl, downloadAttachmentBlob } from '@/services/api/messenger/messengerService'
import { getFileIcon, middleTruncate } from '@/utils/files/fileIcons'
import { toast } from 'sonner'

// Реэкспорт — для обратной совместимости с другими модулями, импортирующими из ComposeField
export { getFileIcon }

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

// ── FileChipRow ──

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'])
const PDF_EXTS = new Set(['pdf'])

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function FileChipRow({
  name,
  Icon,
  iconColor,
  onRemove,
  storagePath,
  fileId,
  localFile,
}: {
  name: string
  Icon: LucideIcon
  iconColor: string
  onRemove?: () => void
  storagePath?: string
  fileId?: string | null
  localFile?: File
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const ext = getExt(name)
  const isImg = IMAGE_EXTS.has(ext)
  const isPdf = PDF_EXTS.has(ext)

  const handleClick = async () => {
    if (isImg) {
      if (localFile) {
        const url = URL.createObjectURL(localFile)
        setLightboxUrl(url)
      } else if (storagePath) {
        const url = await downloadAttachmentBlob(storagePath, fileId)
        setLightboxUrl(url)
      }
    } else if (isPdf) {
      if (localFile) {
        const url = URL.createObjectURL(localFile)
        window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      } else if (storagePath) {
        const url = await getAttachmentUrl(storagePath, fileId)
        window.open(url, '_blank')
      }
    }
  }

  const closeLightbox = useCallback(() => {
    if (lightboxUrl) {
      URL.revokeObjectURL(lightboxUrl)
      setLightboxUrl(null)
    }
  }, [lightboxUrl])

  const canPreview = isImg || isPdf

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md pl-1.5 pr-2 py-1 text-xs min-w-0',
          canPreview && 'cursor-pointer hover:bg-gray-100 transition-colors',
        )}
        title={name}
        role={canPreview ? 'button' : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onClick={canPreview ? handleClick : undefined}
        onKeyDown={
          canPreview
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClick()
                }
              }
            : undefined
        }
      >
        <Icon className={`h-3.5 w-3.5 ${iconColor} shrink-0`} />
        <span className="flex-1 min-w-0 whitespace-nowrap text-gray-700">
          {middleTruncate(name)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-gray-100/90 rounded p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {lightboxUrl && <ImageLightbox src={lightboxUrl} alt={name} onClose={closeLightbox} />}
    </>
  )
}

// ── ComposeField ──

export interface ComposeFieldHandle {
  getHtml: () => string
  getText: () => string
  getFiles: () => File[]
  addFiles: (files: File[]) => void
  setHtml: (html: string) => void
  clear: () => void
  isEmpty: () => boolean
  focus: () => void
  editor: Editor | null
}

interface ComposeFieldProps {
  placeholder?: string
  editorMaxHeight?: number
  disabled?: boolean
  /** Show attachment button (default: true) */
  showAttachments?: boolean
  /** Show toolbar (default: true) */
  showToolbar?: boolean
  /** Initial HTML — applied when editor becomes ready or when this value changes */
  initialHtml?: string | null
  /** Show quick reply templates (requires projectId + workspaceId) */
  projectId?: string
  workspaceId?: string
  /** Open document picker for project files */
  onOpenDocPicker?: () => void
  /** Number of project documents available */
  projectDocumentsCount?: number
  /** Callback on any content change */
  onChange?: (hasContent: boolean) => void
  /** Callback on Ctrl+Enter */
  onSubmit?: () => void
  className?: string
}

export const ComposeField = forwardRef<ComposeFieldHandle, ComposeFieldProps>(function ComposeField(
  {
    placeholder = 'Введите сообщение...',
    editorMaxHeight = 200,
    disabled = false,
    showAttachments = true,
    showToolbar = true,
    initialHtml,
    projectId,
    workspaceId,
    onOpenDocPicker,
    projectDocumentsCount = 0,
    onChange,
    onSubmit,
    className,
  },
  ref,
) {
  const [hasText, setHasText] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [editor, setEditor] = useState<Editor | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const [openQuickReply, setOpenQuickReply] = useState(false)
  const showQuickReply = !!(projectId && workspaceId)

  const onSubmitRef = useRef(onSubmit)
  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const all = Array.from(newFiles)
    const tooBig = all.filter((f) => f.size > MAX_FILE_SIZE)
    if (tooBig.length > 0) {
      toast.warning(
        tooBig.length === 1
          ? `Файл "${tooBig[0].name}" слишком большой (макс. 20 МБ)`
          : `${tooBig.length} файл(а/ов) слишком большие (макс. 20 МБ)`,
      )
    }
    const arr = all.filter((f) => f.size <= MAX_FILE_SIZE)
    if (arr.length > 0) {
      setFiles((prev) => [...prev, ...arr])
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const hasContent = hasText || files.length > 0

  // Notify parent about content changes
  useEffect(() => {
    onChange?.(hasContent)
  }, [hasContent, onChange])

  // Apply initialHtml once editor is ready (fixes race with Tiptap's async init).
  // Re-applies when initialHtml reference changes (e.g. user picks another template).
  const appliedHtmlRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (initialHtml == null) return
    if (appliedHtmlRef.current === initialHtml) return
    editor.commands.setContent(initialHtml)
    appliedHtmlRef.current = initialHtml
    setHasText(editor.getText().trim().length > 0)
  }, [editor, initialHtml])

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => editorRef.current?.getHTML() ?? '',
      getText: () => editorRef.current?.getText().trim() ?? '',
      getFiles: () => files,
      addFiles,
      setHtml: (html: string) => {
        editorRef.current?.commands.setContent(html)
        setHasText((editorRef.current?.getText().trim().length ?? 0) > 0)
      },
      clear: () => {
        editorRef.current?.commands.clearContent()
        setHasText(false)
        setFiles([])
      },
      isEmpty: () => !hasContent,
      focus: () => editorRef.current?.commands.focus('end'),
      editor,
    }),
    [files, hasContent, editor, addFiles],
  )

  return (
    <div className={cn('rounded-md border bg-background min-w-0 overflow-hidden', className)}>
      {/* Editor */}
      <div
        className="px-3 pt-1 min-w-0"
        onKeyDown={
          showQuickReply
            ? (e) => {
                if (e.key === '/' && !hasText && editorRef.current) {
                  e.preventDefault()
                  setOpenQuickReply(true)
                }
              }
            : undefined
        }
      >
        <MinimalTiptapEditor
          editorRef={editorRef}
          onSend={() => onSubmitRef.current?.()}
          onTyping={() => {
            const text = editorRef.current?.getText() ?? ''
            setHasText(!!text.trim())
          }}
          onPasteFiles={showAttachments ? addFiles : undefined}
          disabled={disabled}
          onEditorReady={setEditor}
          editorMaxHeight={editorMaxHeight}
          placeholder={placeholder}
        />
      </div>

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1">
          {files.map((file, i) => {
            const fi = getFileIcon(file.name)
            return (
              <FileChipRow
                key={`${file.name}-${i}`}
                name={file.name}
                Icon={fi.icon}
                iconColor={fi.color}
                onRemove={() => removeFile(i)}
                localFile={file}
              />
            )
          })}
        </div>
      )}

      {/* Toolbar */}
      {(showAttachments || showToolbar) && (
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5 pt-0">
          {showAttachments && (
            <AttachmentButton
              onFilesSelected={addFiles}
              onOpenDocPicker={onOpenDocPicker}
              projectDocumentsCount={projectDocumentsCount}
              disabled={disabled}
              multiple
              buttonClassName="h-7 w-7 text-muted-foreground hover:text-foreground"
              iconClassName="h-3.5 w-3.5"
              badge={files.length || undefined}
            />
          )}
          {showQuickReply && editor && (
            <>
              {showAttachments && <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />}
              <QuickReplyPicker
                editor={editor}
                projectId={projectId!}
                workspaceId={workspaceId!}
                externalOpen={openQuickReply}
                onExternalOpenHandled={() => setOpenQuickReply(false)}
              />
            </>
          )}
          {(showAttachments || showQuickReply) && showToolbar && (
            <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />
          )}
          {showToolbar && editor && <MessengerToolbar editor={editor} />}
        </div>
      )}
    </div>
  )
})
