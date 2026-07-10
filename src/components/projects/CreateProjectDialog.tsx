"use client"

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { useWorkspaceLimitStatus } from '@/hooks/useWorkspaceUsage'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { createProjectFromTemplate } from '@/services/projects/createProjectFromTemplate'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { TemplateSelector } from './create-project/TemplateSelector'
import { TemplateItemsList } from './create-project/TemplateItemsList'
import { useProjectTemplateContent } from './create-project/useProjectTemplateContent'
import { ParticipantsPicker } from '@/components/participants/ParticipantsPicker'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTemplateTaskGroups } from '@/hooks/plan/useTemplateTaskGroups'
import { SYSTEM_PROJECT_ROLES } from '@/types/permissions'
import { projectTemplateKeys } from '@/hooks/queryKeys'
import type { ThreadTemplate } from '@/types/threadTemplate'

type CreateProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (project: { id: string }) => void
  /** Префилл поля «Название» при открытии (напр. имя контакта при создании сделки из чата). */
  defaultName?: string
  /** Предвыбор шаблона проекта при открытии (быстрое действие «+»). */
  defaultTemplateId?: string | null
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultName,
  defaultTemplateId,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocKitIds, setSelectedDocKitIds] = useState<Set<string>>(new Set())
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const { workspaceId: currentWorkspaceId } = useWorkspaceContext()
  const { atLimit } = useWorkspaceLimitStatus(currentWorkspaceId)
  // Участники воркспейса для пикера «Исполнители» (тот же формат PickerParticipant).
  const { data: workspaceParticipants = [] } = useWorkspaceParticipants(currentWorkspaceId)

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

  const { docKitTemplates, formTemplates, scopedThreadTemplates, planContentBlocks } =
    useProjectTemplateContent(activeTemplateId, currentWorkspaceId, open)

  // Группы задач шаблона — чтобы в списке «Задачи и чаты» показывать группы,
  // как в редакторе шаблона (а не плоским списком).
  const { groups: templateTaskGroups } = useTemplateTaskGroups(activeTemplateId, currentWorkspaceId)

  // Массово отметить/снять все задачи, чаты и блоки состава шаблона.
  const toggleAllTasks = (select: boolean) => {
    setSelectedTaskIds(select ? new Set(scopedThreadTemplates.map((t) => t.id)) : new Set())
    setSelectedBlockIds(select ? new Set(planContentBlocks.map((b) => b.id)) : new Set())
  }

  const docKitKey = docKitTemplates.map((t) => t.id).join(',')
  const formKey = formTemplates.map((t) => t.id).join(',')
  const threadKey = scopedThreadTemplates.map((t) => t.id).join(',')
  const blockKey = planContentBlocks.map((b) => b.id).join(',')

  // По умолчанию все чекбоксы состава шаблона СНЯТЫ — пользователь сам отмечает,
  // что создавать вместе с проектом (есть кнопка «выбрать все задачи и чаты»).
  // Эффекты на смену шаблона просто сбрасывают выбор в пустой.
  useEffect(() => {
    setSelectedDocKitIds(new Set())
    setSelectedFormIds(new Set())
  }, [docKitKey, formKey])

  useEffect(() => {
    setSelectedTaskIds(new Set())
  }, [threadKey])

  useEffect(() => {
    setSelectedBlockIds(new Set())
  }, [blockKey])

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setTemplateId('')
      setAssigneeIds([])
      setError(null)
      setSelectedDocKitIds(new Set())
      setSelectedFormIds(new Set())
      setSelectedTaskIds(new Set())
      setSelectedBlockIds(new Set())
    } else {
      // Префилл имени и/или предвыбор шаблона при открытии.
      if (defaultName) setName(defaultName)
      if (defaultTemplateId) setTemplateId(defaultTemplateId)
    }
  }, [open, defaultName, defaultTemplateId])

  // Префикс шаблона (default_name_prefix) в имя проекта НЕ вшивается. Если шаблон
  // разрешил показ префикса — рисуем его серым внутри поля названия (как в шапке
  // проекта и сайдбаре). Имя пользователь печатает без префикса.
  const activeTemplate = projectTemplatesRaw.find((t) => t.id === activeTemplateId)
  const namePrefix = activeTemplate?.show_name_prefix_in_sidebar
    ? activeTemplate.default_name_prefix?.trim() || null
    : null

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
    if (atLimit('projects')) {
      setError('Достигнут лимит проектов по тарифу. Повысьте тариф, чтобы создавать новые.')
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
      // Исполнители — вторым шагом: createProjectFromTemplate участников не создаёт.
      // Новый проект пуст, поэтому просто insert выбранных с ролью «Исполнитель».
      if (assigneeIds.length > 0) {
        const { error: partErr } = await supabase.from('project_participants').insert(
          assigneeIds.map((pid) => ({
            project_id: projectId,
            participant_id: pid,
            project_roles: [SYSTEM_PROJECT_ROLES.EXECUTOR],
          })),
        )
        if (partErr) {
          // Проект уже создан — не валим весь флоу, просто предупреждаем.
          console.error('Не удалось добавить исполнителей в проект:', partErr)
          toast.warning('Проект создан, но исполнителей добавить не удалось')
        }
      }
      onSuccess({ id: projectId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setIsLoading(false)
    }
  }


  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-3xl p-6 max-h-[90vh] flex flex-col">
        <h2 className="text-2xl font-bold mb-4 shrink-0">Создать проект</h2>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          {error && <Alert variant="destructive" className="mb-4 shrink-0">{error}</Alert>}

          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {/* Левая колонка: тип, название/описание, исполнители */}
            <div className="space-y-4">
              <TemplateSelector
                value={templateId}
                onChange={setTemplateId}
                templates={projectTemplates}
                disabled={isLoading}
                autoOpen
              />

              {/* Название + описание в единой рамке — тот же стиль, что у тредов
                  (ChatSettingsDialog): название сверху, разделитель, описание снизу. */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Название</Label>
                <div className="rounded-md border border-input bg-background overflow-hidden transition-shadow focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.10)]">
            {namePrefix ? (
              <div className="flex items-center pl-3">
                <span className="text-[17px] font-semibold text-muted-foreground/50 shrink-0 mr-1 select-none">
                  {namePrefix}
                </span>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название проекта"
                  disabled={isLoading}
                  className="flex-1 min-w-0 h-10 pr-2 py-1 text-[17px] font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40 placeholder:font-normal disabled:opacity-50"
                />
              </div>
            ) : (
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название проекта"
                disabled={isLoading}
                className="w-full h-10 px-3 py-1 text-[17px] font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40 placeholder:font-normal disabled:opacity-50"
              />
            )}
            <div className="h-px bg-border mx-2" />
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание проекта"
              disabled={isLoading}
              rows={2}
                  className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground/40 max-h-64 overflow-y-auto disabled:opacity-50"
                />
                </div>
              </div>

              {/* Исполнители — общий ParticipantsPicker (как в настройках проекта). */}
              <div className="space-y-1.5">
                <Label>Исполнители</Label>
                <ParticipantsPicker
                  participants={workspaceParticipants}
                  selectedIds={assigneeIds}
                  onChange={setAssigneeIds}
                  placeholder="Выберите участников..."
                />
              </div>
            </div>

            {/* Правая колонка: состав шаблона — видна всегда; при пустом составе
                TemplateItemsList показывает подсказку выбрать тип проекта. */}
            <div className="space-y-1.5 min-w-0">
              <Label>Будут созданы вместе с проектом</Label>
              <TemplateItemsList
                docKitTemplates={docKitTemplates}
                formTemplates={formTemplates}
                threads={scopedThreadTemplates}
                planBlocks={planContentBlocks}
                taskGroups={templateTaskGroups}
                selectedDocKitIds={selectedDocKitIds}
                selectedFormIds={selectedFormIds}
                selectedThreadIds={selectedTaskIds}
                selectedBlockIds={selectedBlockIds}
                onToggleDocKit={toggleDocKit}
                onToggleForm={toggleForm}
                onToggleThread={toggleTask}
                onToggleBlock={toggleBlock}
                onToggleAllTasks={toggleAllTasks}
                disabled={isLoading}
                title=""
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-4 shrink-0">
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
