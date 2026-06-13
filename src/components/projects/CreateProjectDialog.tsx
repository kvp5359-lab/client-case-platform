"use client"

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { createDocumentKitFromTemplate } from '@/services/api/documents/documentKitService'
import { createFormKitFromTemplate } from '@/services/api/forms/formKitService'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { Loader2 } from 'lucide-react'
import { addDays } from 'date-fns'
import { TemplateSelector } from './create-project/TemplateSelector'
import { TemplateItemsList } from './create-project/TemplateItemsList'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { useTemplatePlan } from '@/hooks/plan/useTemplatePlan'
import { projectTemplateKeys } from '@/hooks/queryKeys'
import type { ThreadTemplate } from '@/types/threadTemplate'

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (project: { id: string }) => void
}

export function CreateProjectDialog({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocKitIds, setSelectedDocKitIds] = useState<Set<string>>(new Set())
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const { workspaceId: currentWorkspaceId } = useWorkspaceContext()

  const activeTemplateId = templateId && templateId !== 'none' ? templateId : undefined

  const { data: projectTemplatesRaw = [] } = useQuery({
    queryKey: projectTemplateKeys.listByWorkspace(currentWorkspaceId),
    queryFn: async () => {
      if (!currentWorkspaceId) return []
      // Тот же queryFn и порядок (order_index), что у редактора шаблонов
      // (ProjectTemplatesContent через useTemplateList) — иначе общий кеш-ключ
      // `['project-templates', ws]` перетирался бы разным порядком.
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('workspace_id', currentWorkspaceId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!currentWorkspaceId && open,
  })
  // Для пикера показываем по алфавиту — сортируем на клиенте, не трогая кеш.
  const projectTemplates = useMemo(
    () => [...projectTemplatesRaw].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    [projectTemplatesRaw],
  )

  const { data: linkedDocKits = [] } = useQuery({
    queryKey: projectTemplateKeys.documentKits(activeTemplateId),
    queryFn: async () => {
      if (!activeTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_document_kits')
        .select('*, document_kit_template:document_kit_templates(id, name)')
        .eq('project_template_id', activeTemplateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!activeTemplateId && open,
  })

  // Шаблоны тредов (задачи и чаты в одной секции), привязанные к типу проекта.
  const { data: scopedThreadTemplates = [] } = useThreadTemplatesByProjectTemplate(
    activeTemplateId,
  )

  const { data: linkedForms = [] } = useQuery({
    queryKey: projectTemplateKeys.forms(activeTemplateId),
    queryFn: async () => {
      if (!activeTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_forms')
        .select('*, form_template:form_templates(id, name)')
        .eq('project_template_id', activeTemplateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!activeTemplateId && open,
  })

  // Структурные блоки плана шаблона (заголовки/текст) — для превью списка
  // «Задачи и чаты». Переиспользуем тот же запрос, что и редактор шаблона.
  const { blocks: templatePlanBlocks } = useTemplatePlan(activeTemplateId, currentWorkspaceId)
  const planContentBlocks = useMemo(
    () =>
      templatePlanBlocks.filter((b) => b.block_type === 'heading' || b.block_type === 'text'),
    [templatePlanBlocks],
  )

  const docKitTemplates = useMemo(
    () =>
      linkedDocKits
        .map((item) => {
          const tpl = Array.isArray(item.document_kit_template)
            ? item.document_kit_template[0]
            : item.document_kit_template
          return tpl as { id: string; name: string } | null
        })
        .filter((t): t is { id: string; name: string } => t !== null),
    [linkedDocKits],
  )

  const formTemplates = useMemo(
    () =>
      linkedForms
        .map((item) => {
          const tpl = Array.isArray(item.form_template) ? item.form_template[0] : item.form_template
          return tpl as { id: string; name: string } | null
        })
        .filter((t): t is { id: string; name: string } => t !== null),
    [linkedForms],
  )

  const docKitKey = docKitTemplates.map((t) => t.id).join(',')
  const formKey = formTemplates.map((t) => t.id).join(',')
  const threadKey = scopedThreadTemplates.map((t) => t.id).join(',')
  const blockKey = planContentBlocks.map((b) => b.id).join(',')

  useEffect(() => {
    setSelectedDocKitIds(new Set(docKitTemplates.map((t) => t.id)))
    setSelectedFormIds(new Set(formTemplates.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKitKey, formKey])

  useEffect(() => {
    // По умолчанию — все шаблоны задач и чатов отмечены, пользователь может
    // снять галочки с тех, что не нужны для конкретного проекта.
    setSelectedTaskIds(new Set(scopedThreadTemplates.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey])

  useEffect(() => {
    // Заголовки/текст шаблона по умолчанию включены.
    setSelectedBlockIds(new Set(planContentBlocks.map((b) => b.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKey])

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setTemplateId('')
      setError(null)
      setSelectedDocKitIds(new Set())
      setSelectedFormIds(new Set())
      setSelectedTaskIds(new Set())
      setSelectedBlockIds(new Set())
    }
  }, [open])

  const toggleDocKit = (id: string) => {
    setSelectedDocKitIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleForm = (id: string) => {
    setSelectedFormIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTask = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBlock = (id: string) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspaceId) {
      setError('Не выбран workspace')
      return
    }
    if (!name.trim()) {
      setError('Введите название проекта')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data: project, error: insertError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          workspace_id: currentWorkspaceId,
          created_by: user?.id || null,
          template_id: activeTemplateId || null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      const promises: Promise<void>[] = []

      for (const docKitTemplateId of selectedDocKitIds) {
        promises.push(
          createDocumentKitFromTemplate(docKitTemplateId, project.id, currentWorkspaceId).then(
            () => {},
          ),
        )
      }

      for (const formTemplateId of selectedFormIds) {
        promises.push(
          createFormKitFromTemplate(formTemplateId, project.id, currentWorkspaceId).then(() => {}),
        )
      }

      // Инстанциация шаблонов тредов (задач и чатов): создаём project_threads,
      // копируем assignees из thread_template_assignees, проставляем
      // source_template_id — так меню "+" внутри проекта будет скрывать
      // только что созданные шаблоны как "уже использованные".
      const selectedThreadTemplates: ThreadTemplate[] = scopedThreadTemplates.filter((t) =>
        selectedTaskIds.has(t.id),
      )

      for (const tpl of selectedThreadTemplates) {
        promises.push(
          (async () => {
            const deadline =
              tpl.thread_type === 'task' && tpl.deadline_days != null
                ? addDays(new Date(), tpl.deadline_days).toISOString()
                : null
            const { data: thread, error: threadErr } = await supabase
              .from('project_threads')
              .insert({
                project_id: project.id,
                workspace_id: currentWorkspaceId,
                name: tpl.name,
                type: tpl.thread_type,
                access_type: tpl.access_type,
                access_roles: tpl.access_type === 'roles' ? (tpl.access_roles ?? []) : [],
                accent_color: tpl.accent_color,
                icon: tpl.icon,
                status_id: tpl.default_status_id,
                deadline,
                sort_order: tpl.sort_order + 100,
                source_template_id: tpl.id,
              })
              .select('id')
              .single()
            if (threadErr) throw threadErr

            // Copy assignees for tasks.
            const assigneeIds = (tpl.thread_template_assignees ?? []).map(
              (a) => a.participant_id,
            )
            if (tpl.thread_type === 'task' && assigneeIds.length > 0) {
              const rows = assigneeIds.map((pid) => ({
                thread_id: thread.id,
                participant_id: pid,
              }))
              const { error: aErr } = await supabase.from('task_assignees').insert(rows)
              if (aErr) {
                logger.warn(
                  `Не удалось назначить исполнителей в треде ${thread.id}: ${aErr.message}`,
                )
              }
            }
          })(),
        )
      }

      if (promises.length > 0) {
        const results = await Promise.allSettled(promises)
        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length > 0) {
          logger.error('Ошибки при создании наборов/анкет:', failed)
          toast.warning(`Проект создан, но ${failed.length} набор(ов) не удалось создать`)
        }
      }

      // Разворачивание «рыбы» плана из шаблона (модуль «План», Фаза 3).
      // Делаем ПОСЛЕ создания тредов, чтобы резолвить thread_template_id →
      // созданный тред по source_template_id. Текст копируется, задачи
      // привязываются. Слоты в шаблоне пока не поддерживаются. Любая ошибка
      // здесь некритична — проект уже создан.
      if (activeTemplateId) {
        try {
          const { data: tmplBlocks } = await supabase
            .from('project_template_plan_blocks')
            .select('*')
            .eq('project_template_id', activeTemplateId)
            .order('sort_order', { ascending: true })
          // Берём только структурные блоки (заголовки/текст). Задачи живут в
          // project_threads (созданы выше), task-блоки шаблона игнорируем —
          // порядок задач задаёт thread_templates.sort_order.
          const contentBlocks = (tmplBlocks ?? []).filter(
            (b) =>
              (b.block_type === 'heading' || b.block_type === 'text') &&
              selectedBlockIds.has(b.id),
          )
          if (contentBlocks.length > 0) {
            const { data: createdThreads } = await supabase
              .from('project_threads')
              .select('id, source_template_id')
              .eq('project_id', project.id)
            const threadByTemplate = new Map<string, string>()
            for (const t of createdThreads ?? []) {
              if (t.source_template_id) threadByTemplate.set(t.source_template_id, t.id)
            }
            // Единый порядок: задачи (по thread_template.sort_order) и блоки
            // (по их sort_order) сводим в одну шкалу и нумеруем заново, чтобы
            // заголовки/текст встали между задачами как в шаблоне.
            type SeedItem =
              | { kind: 'task'; threadId: string; sort: number }
              | { kind: 'block'; block: (typeof contentBlocks)[number]; sort: number }
            const items: SeedItem[] = []
            for (const tpl of selectedThreadTemplates) {
              const threadId = threadByTemplate.get(tpl.id)
              if (threadId) items.push({ kind: 'task', threadId, sort: tpl.sort_order })
            }
            for (const b of contentBlocks) {
              items.push({ kind: 'block', block: b, sort: b.sort_order })
            }
            items.sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))

            const taskOrder: { threadId: string; index: number }[] = []
            const planRows: {
              workspace_id: string
              project_id: string
              block_type: 'heading' | 'text'
              sort_order: number
              visible_to_client: boolean
              content: string | null
            }[] = []
            items.forEach((it, index) => {
              if (it.kind === 'task') {
                taskOrder.push({ threadId: it.threadId, index })
              } else {
                planRows.push({
                  workspace_id: currentWorkspaceId,
                  project_id: project.id,
                  block_type: it.block.block_type as 'heading' | 'text',
                  sort_order: index,
                  visible_to_client: it.block.visible_to_client,
                  content: it.block.content,
                })
              }
            })

            if (taskOrder.length > 0) {
              await Promise.all(
                taskOrder.map((o) =>
                  supabase
                    .from('project_threads')
                    .update({ sort_order: o.index })
                    .eq('id', o.threadId),
                ),
              )
            }
            if (planRows.length > 0) {
              const { error: planErr } = await supabase
                .from('project_plan_blocks')
                .insert(planRows)
              if (planErr) logger.warn(`Не удалось развернуть план: ${planErr.message}`)
            }
          }
        } catch (planSeedErr) {
          logger.warn(
            `Ошибка разворачивания плана: ${
              planSeedErr instanceof Error ? planSeedErr.message : String(planSeedErr)
            }`,
          )
        }
      }

      onSuccess({ id: project.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setIsLoading(false)
    }
  }

  const hasLinkedItems =
    docKitTemplates.length > 0 ||
    formTemplates.length > 0 ||
    scopedThreadTemplates.length > 0 ||
    planContentBlocks.length > 0

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Создать проект</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название проекта"
            disabled={isLoading}
            className="!text-xl font-semibold !h-12 placeholder:text-muted-foreground/50"
          />

          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание проекта"
            disabled={isLoading}
            className="placeholder:text-muted-foreground/50"
          />

          <TemplateSelector
            value={templateId}
            onChange={setTemplateId}
            templates={projectTemplates}
            disabled={isLoading}
          />

          {activeTemplateId && hasLinkedItems && (
            <TemplateItemsList
              docKitTemplates={docKitTemplates}
              formTemplates={formTemplates}
              threads={scopedThreadTemplates}
              planBlocks={planContentBlocks}
              selectedDocKitIds={selectedDocKitIds}
              selectedFormIds={selectedFormIds}
              selectedThreadIds={selectedTaskIds}
              selectedBlockIds={selectedBlockIds}
              onToggleDocKit={toggleDocKit}
              onToggleForm={toggleForm}
              onToggleThread={toggleTask}
              onToggleBlock={toggleBlock}
              disabled={isLoading}
            />
          )}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Создание...
                </>
              ) : (
                'Создать'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
