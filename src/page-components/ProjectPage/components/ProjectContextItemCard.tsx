'use client'

/**
 * Карточка одной записи «Контекста проекта».
 * Поддерживает три типа: text / file / screenshot.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  Download,
  FileIcon,
  FileText,
  Image as ImageIcon,
  Languages,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import {
  useRenameContextItem,
  useRunContextExtraction,
} from '@/hooks/projects/useProjectContext'
import { formatBytes } from '@/utils/files/formatBytes'
import type { ProjectContextItemWithFile } from '@/services/api/projectContext/projectContextService'
import { ContextTextDialog } from './ContextTextDialog'

type ProjectContextItemCardProps = {
  item: ProjectContextItemWithFile
  projectId: string
  workspaceId: string
  onDelete: () => void
}

export function ProjectContextItemCard({
  item,
  projectId,
  workspaceId,
  onDelete,
}: ProjectContextItemCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)
  const [textDialogOpen, setTextDialogOpen] = useState(false)

  const renameMutation = useRenameContextItem(projectId)
  const extractMutation = useRunContextExtraction(projectId)

  useEffect(() => {
    setNameDraft(item.name)
  }, [item.name])

  const Icon = pickIcon(item)

  const handleRename = async () => {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === item.name) {
      setEditingName(false)
      setNameDraft(item.name)
      return
    }
    try {
      await renameMutation.mutateAsync({ id: item.id, name: trimmed })
    } catch (err) {
      toast.error('Не удалось переименовать', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setEditingName(false)
    }
  }

  const handleDownload = async () => {
    if (!item.file) return
    try {
      const { data, error } = await supabase.storage
        .from(item.file.bucket)
        .createSignedUrl(item.file.storage_path, 60)
      if (error || !data?.signedUrl) throw error ?? new Error('Не удалось получить ссылку')
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error('Не удалось скачать', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleExtract = async () => {
    try {
      const res = await extractMutation.mutateAsync(item)
      if (res.status === 'done') {
        toast.success('Текст извлечён')
      } else {
        toast.error('Не удалось извлечь', { description: res.error })
      }
    } catch (err) {
      toast.error('Ошибка', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const canExtract = useMemo(() => {
    if (!item.file) return null
    const mime = item.file.mime_type || ''
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      return { label: 'Расшифровать', kind: 'transcribe' as const }
    }
    if (
      mime === 'application/pdf' ||
      mime.includes('officedocument.wordprocessingml.document') ||
      mime === 'application/msword' ||
      mime.startsWith('image/')
    ) {
      return { label: 'Извлечь текст', kind: 'extract' as const }
    }
    return null
  }, [item.file])

  return (
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-start gap-2 min-w-0">
        <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') {
                  setNameDraft(item.name)
                  setEditingName(false)
                }
              }}
              autoFocus
              className="h-7 text-sm"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-left text-sm font-medium truncate w-full hover:text-primary transition-colors"
              title="Переименовать"
            >
              {item.name}
            </button>
          )}
          {item.file && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {item.file.file_name} · {formatBytes(item.file.file_size)}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingName(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Переименовать
            </DropdownMenuItem>
            {item.file && (
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Скачать
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* preview / body */}
      {item.item_type === 'text' && (
        <>
          <button
            type="button"
            onClick={() => setTextDialogOpen(true)}
            className="w-full text-left rounded-md border bg-muted/30 p-2 hover:bg-muted/50 transition-colors text-xs"
            title="Открыть редактор"
          >
            {item.content_html?.trim() ? (
              <div
                className="prose prose-xs max-w-none line-clamp-6 dark:prose-invert [&_*]:!my-0 [&_*]:!leading-snug"
                dangerouslySetInnerHTML={{ __html: item.content_html }}
              />
            ) : (
              <span className="text-muted-foreground italic">
                Пусто. Нажмите, чтобы добавить текст.
              </span>
            )}
          </button>
          {textDialogOpen && (
            <ContextTextDialog
              item={item}
              projectId={projectId}
              workspaceId={workspaceId}
              onClose={() => setTextDialogOpen(false)}
            />
          )}
        </>
      )}

      {item.item_type === 'screenshot' && item.file && (
        <ScreenshotPreview file={item.file} />
      )}

      {/* extraction display (auto при создании; ручная кнопка — fallback при ошибке) */}
      {canExtract && (
        <div className="border-t pt-2 mt-1">
          {item.extracted_text ? (
            <div>
              <button
                type="button"
                onClick={() => setExpanded((x) => !x)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {canExtract.kind === 'transcribe' ? 'Расшифровка' : 'Извлечённый текст'}
              </button>
              {expanded && (
                <div className="mt-1 text-xs whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 max-h-40 overflow-auto">
                  {item.extracted_text}
                </div>
              )}
            </div>
          ) : item.extraction_status === 'running' || extractMutation.isPending ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {canExtract.kind === 'transcribe' ? 'Расшифровываю…' : 'Извлекаю текст…'}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={handleExtract}
            >
              <Languages className="h-3.5 w-3.5 mr-1.5" />
              Повторить {canExtract.kind === 'transcribe' ? 'расшифровку' : 'извлечение'}
            </Button>
          )}
          {item.extraction_status === 'error' && item.extraction_error && (
            <p className="text-xs text-destructive mt-1">{item.extraction_error}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ScreenshotPreview({
  file,
}: {
  file: NonNullable<ProjectContextItemWithFile['file']>
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.storage_path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) return
        if (data?.signedUrl) setUrl(data.signedUrl)
      })
    return () => {
      cancelled = true
    }
  }, [file.bucket, file.storage_path])

  if (!url) {
    return (
      <div className="flex items-center justify-center h-32 rounded-md border bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-md border overflow-hidden bg-muted/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="screenshot"
        className="w-full max-h-40 object-contain"
        loading="lazy"
      />
    </a>
  )
}

function pickIcon(item: ProjectContextItemWithFile) {
  if (item.item_type === 'text') return FileText
  if (item.item_type === 'screenshot') return ImageIcon
  const mime = item.file?.mime_type ?? ''
  if (mime.startsWith('image/')) return ImageIcon
  if (mime.startsWith('audio/')) return AudioLines
  if (mime.startsWith('video/')) return Video
  return FileIcon
}

