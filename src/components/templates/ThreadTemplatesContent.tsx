/**
 * Список шаблонов тредов в настройках workspace → Шаблоны.
 * CRUD через useTemplateList + ThreadTemplateDialog.
 */

import { useState, useCallback, createElement } from 'react'
import { useParams } from 'next/navigation'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Plus, Search, Copy, Pencil, Trash2, MessageSquare, CheckSquare, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { threadTemplateKeys } from '@/hooks/queryKeys'
import { useThreadTemplates } from '@/hooks/messenger/useThreadTemplates'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ThreadTemplateDialog } from './ThreadTemplateDialog'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import { COLOR_BG } from '@/components/messenger/threadConstants'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'

function getTypeBadge(t: ThreadTemplate) {
  if (t.is_email)
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
        <Mail className="w-3 h-3" /> Email
      </span>
    )
  if (t.thread_type === 'task')
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
        <CheckSquare className="w-3 h-3" /> Задача
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
      <MessageSquare className="w-3 h-3" /> Чат
    </span>
  )
}

export function ThreadTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const { data: templates = [], isLoading } = useThreadTemplates(workspaceId)

  const [searchQuery, setSearchQuery] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ThreadTemplate | null>(null)

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: threadTemplateKeys.byWorkspace(workspaceId ?? '') })
  }, [queryClient, workspaceId])

  // ── Save mutation ──
  const saveMutation = useMutation({
    mutationFn: async ({
      data,
      templateId,
    }: {
      data: ThreadTemplateFormData
      templateId: string | null
    }) => {
      const { assignee_ids, ...templateData } = data

      if (templateId) {
        // Update template + replace assignees atomically via RPC
        const { error } = await supabase.rpc('update_thread_template_with_assignees', {
          p_template_id: templateId,
          p_updates: templateData,
          p_assignee_ids: assignee_ids,
        })
        if (error) throw error
      } else {
        // Create
        const { data: created, error } = await supabase
          .from('thread_templates')
          .insert({ ...templateData, workspace_id: workspaceId ?? '' })
          .select('id')
          .single()
        if (error) throw error
        if (assignee_ids.length > 0) {
          const { error: aErr } = await supabase
            .from('thread_template_assignees')
            .insert(assignee_ids.map((pid) => ({ template_id: created.id, participant_id: pid })))
          if (aErr) throw aErr
        }
      }
    },
    onSuccess: () => {
      invalidate()
      setIsDialogOpen(false)
      setEditingItem(null)
      toast.success('Шаблон сохранён')
    },
    onError: (error) => {
      logger.error('Ошибка сохранения шаблона треда:', error)
      toast.error('Не удалось сохранить шаблон')
    },
  })

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('thread_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон удалён')
    },
    onError: (error) => {
      logger.error('Ошибка удаления шаблона треда:', error)
      toast.error('Не удалось удалить шаблон')
    },
  })

  // ── Copy mutation ──
  const copyMutation = useMutation({
    mutationFn: async (item: ThreadTemplate) => {
      // Copy template + assignees atomically via RPC
      const { error } = await supabase.rpc('copy_thread_template', {
        p_template_id: item.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Шаблон скопирован')
    },
    onError: (error) => {
      logger.error('Ошибка копирования шаблона треда:', error)
      toast.error('Не удалось скопировать шаблон')
    },
  })

  // ── Handlers ──
  const handleCreate = () => {
    setEditingItem(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (item: ThreadTemplate) => {
    setEditingItem(item)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить шаблон',
      description: 'Шаблон будет удалён без возможности восстановления.',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  const handleSave = (data: ThreadTemplateFormData) => {
    saveMutation.mutate({ data, templateId: editingItem?.id ?? null })
  }

  // ── Filter ──
  const filtered = templates.filter((t) => {
    const q = searchQuery.toLowerCase()
    return t.name.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false)
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Шаблоны тредов</h2>
          <p className="text-sm text-muted-foreground">
            Быстрое создание чатов, задач и email-каналов по шаблону
          </p>
        </div>
        <Button onClick={handleCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Создать шаблон
        </Button>
      </div>

      {/* Search */}
      {templates.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по шаблонам..."
            className="pl-8 h-9"
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {templates.length === 0 ? 'Шаблонов пока нет' : 'Ничего не найдено'}
        </p>
      ) : (
        <div className="border rounded-lg divide-y">
          {filtered.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 group">
              {/* Icon with color */}
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  COLOR_BG[t.accent_color] ?? 'bg-blue-500',
                )}
              >
                {createElement(getChatIconComponent(t.icon), {
                  className: 'w-4 h-4 text-white',
                })}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{t.name}</span>
                  {getTypeBadge(t)}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleEdit(t)}
                  title="Редактировать"
                  aria-label="Редактировать шаблон"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => copyMutation.mutate(t)}
                  title="Копировать"
                  aria-label="Копировать шаблон"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(t.id)}
                  title="Удалить"
                  aria-label="Удалить шаблон"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <ThreadTemplateDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setEditingItem(null)
        }}
        workspaceId={workspaceId ?? ''}
        template={editingItem}
        onSave={handleSave}
        isPending={saveMutation.isPending}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
