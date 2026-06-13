"use client"

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { createProjectFromTemplate } from '@/services/projects/createProjectFromTemplate'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
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
  /** Префилл поля «Название» при открытии (напр. имя контакта при создании сделки из чата). */
  defaultName?: string
}

export function CreateProjectDialog({ open, onOpenChange, onSuccess, defaultName }: CreateProjectDialogProps) {
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
    } else if (defaultName) {
      // Префилл имени при открытии (создание проекта/сделки из чата).
      setName(defaultName)
    }
  }, [open, defaultName])

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
      const selectedThreadTemplates: ThreadTemplate[] = scopedThreadTemplates.filter((t) =>
        selectedTaskIds.has(t.id),
      )
      const { projectId, kitFormFailures } = await createProjectFromTemplate({
        workspaceId: currentWorkspaceId,
        name,
        description,
        templateId: activeTemplateId,
        selectedDocKitIds: [...selectedDocKitIds],
        selectedFormIds: [...selectedFormIds],
        selectedThreadTemplates,
        selectedBlockIds,
      })
      if (kitFormFailures > 0) {
        toast.warning(`Проект создан, но ${kitFormFailures} набор(ов) не удалось создать`)
      }
      onSuccess({ id: projectId })
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
