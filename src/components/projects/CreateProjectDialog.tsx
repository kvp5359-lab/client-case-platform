"use client"

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { createDocumentKitFromTemplate } from '@/services/api/documentKitService'
import { createFormKitFromTemplate } from '@/services/api/formKitService'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { Loader2 } from 'lucide-react'
import { TemplateSelector } from './create-project/TemplateSelector'
import { TemplateItemsList } from './create-project/TemplateItemsList'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
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
  const { currentWorkspaceId } = useWorkspaceStore()

  const activeTemplateId = templateId && templateId !== 'none' ? templateId : undefined

  const { data: projectTemplates = [] } = useQuery({
    queryKey: ['project-templates', currentWorkspaceId],
    queryFn: async () => {
      if (!currentWorkspaceId) return []
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('workspace_id', currentWorkspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data || []
    },
    enabled: !!currentWorkspaceId && open,
  })

  const { data: linkedDocKits = [] } = useQuery({
    queryKey: ['project-template-document-kits', activeTemplateId],
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

  const { data: linkedTemplateTasks = [] } = useQuery({
    queryKey: ['project-template-tasks', activeTemplateId],
    queryFn: async () => {
      if (!activeTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_tasks')
        .select('id, name, sort_order')
        .eq('project_template_id', activeTemplateId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []) as { id: string; name: string; sort_order: number }[]
    },
    enabled: !!activeTemplateId && open,
  })

  const { data: linkedForms = [] } = useQuery({
    queryKey: ['project-template-forms', activeTemplateId],
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
  const taskKey = linkedTemplateTasks.map((t) => t.id).join(',')

  useEffect(() => {
    setSelectedDocKitIds(new Set(docKitTemplates.map((t) => t.id)))
    setSelectedFormIds(new Set(formTemplates.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKitKey, formKey])

  useEffect(() => {
    setSelectedTaskIds(new Set(linkedTemplateTasks.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey])

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setTemplateId('')
      setError(null)
      setSelectedDocKitIds(new Set())
      setSelectedFormIds(new Set())
      setSelectedTaskIds(new Set())
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

      const selectedTasks = linkedTemplateTasks.filter((t) => selectedTaskIds.has(t.id))
      for (const task of selectedTasks) {
        promises.push(
          supabase
            .from('project_threads')
            .insert({
              project_id: project.id,
              workspace_id: currentWorkspaceId,
              name: task.name,
              type: 'task',
              access_type: 'roles',
              access_roles: ['Администратор', 'Исполнитель'],
              sort_order: task.sort_order + 100,
            })
            .then(({ error }) => {
              if (error) throw error
            }),
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

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка')
    } finally {
      setIsLoading(false)
    }
  }

  const hasLinkedItems =
    docKitTemplates.length > 0 || formTemplates.length > 0 || linkedTemplateTasks.length > 0

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
              tasks={linkedTemplateTasks}
              selectedDocKitIds={selectedDocKitIds}
              selectedFormIds={selectedFormIds}
              selectedTaskIds={selectedTaskIds}
              onToggleDocKit={toggleDocKit}
              onToggleForm={toggleForm}
              onToggleTask={toggleTask}
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
