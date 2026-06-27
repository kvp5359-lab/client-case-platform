"use client"

/**
 * Добавление элементов из шаблона проекта в УЖЕ существующий проект:
 * наборы документов, анкеты, задачи/чаты, блоки плана. Переиспользует
 * UI-селектор `TemplateItemsList` и движок `seedProjectContent` (appendMode) —
 * тот же механизм, что при создании проекта.
 *
 * Задачи, уже инстанциированные в проекте (по source_template_id), скрыты —
 * чтобы не плодить дубли. Наборы/анкеты повтор допускают by design.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TemplateItemsList } from './create-project/TemplateItemsList'
import { useProjectTemplateContent } from './create-project/useProjectTemplateContent'
import { seedProjectContent } from '@/services/projects/createProjectFromTemplate'
import {
  planKeys,
  documentKitKeys,
  formKitKeys,
  workspaceThreadKeys,
  folderSlotKeys,
  addFromTemplateKeys,
} from '@/hooks/queryKeys'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
  templateId: string | undefined
}

export function AddFromTemplateDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  templateId,
}: Props) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [selectedDocKitIds, setSelectedDocKitIds] = useState<Set<string>>(new Set())
  const [selectedFormIds, setSelectedFormIds] = useState<Set<string>>(new Set())
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())

  const { docKitTemplates, formTemplates, scopedThreadTemplates, planContentBlocks } =
    useProjectTemplateContent(templateId, workspaceId, open)

  // Уже добавленные в проект шаблоны тредов — чтобы скрыть их из списка.
  const { data: existingTemplateIds } = useQuery({
    queryKey: addFromTemplateKeys.existingThreads(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('source_template_id')
        .eq('project_id', projectId)
        .eq('is_deleted', false)
      if (error) throw error
      return new Set((data ?? []).map((t) => t.source_template_id).filter(Boolean) as string[])
    },
    enabled: !!projectId && open,
  })

  // Задачи/чаты, которых в проекте ещё нет.
  const availableThreads = useMemo(
    () => scopedThreadTemplates.filter((t) => !(existingTemplateIds?.has(t.id) ?? false)),
    [scopedThreadTemplates, existingTemplateIds],
  )

  const docKitKey = docKitTemplates.map((t) => t.id).join(',')
  const formKey = formTemplates.map((t) => t.id).join(',')
  const threadKey = availableThreads.map((t) => t.id).join(',')
  const blockKey = planContentBlocks.map((b) => b.id).join(',')

  // По умолчанию всё недостающее отмечено.
  useEffect(() => {
    setSelectedDocKitIds(new Set(docKitTemplates.map((t) => t.id)))
    setSelectedFormIds(new Set(formTemplates.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKitKey, formKey])

  useEffect(() => {
    setSelectedTaskIds(new Set(availableThreads.map((t) => t.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey])

  useEffect(() => {
    setSelectedBlockIds(new Set(planContentBlocks.map((b) => b.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKey])

  const toggle = (setter: typeof setSelectedDocKitIds) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const hasItems =
    docKitTemplates.length > 0 ||
    formTemplates.length > 0 ||
    availableThreads.length > 0 ||
    planContentBlocks.length > 0
  const totalSelected =
    selectedDocKitIds.size + selectedFormIds.size + selectedTaskIds.size + selectedBlockIds.size

  const handleAdd = async () => {
    setSaving(true)
    try {
      const { kitFormFailures } = await seedProjectContent({
        workspaceId,
        projectId,
        templateId,
        appendMode: true,
        selectedDocKitIds: [...selectedDocKitIds],
        selectedFormIds: [...selectedFormIds],
        selectedThreadTemplates: availableThreads.filter((t) => selectedTaskIds.has(t.id)),
        selectedBlockIds,
      })

      queryClient.invalidateQueries({ queryKey: planKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: folderSlotKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: workspaceThreadKeys.workspace(workspaceId) })

      if (kitFormFailures > 0) {
        toast.warning(`Добавлено, но ${kitFormFailures} наборов/анкет не создалось`)
      } else {
        toast.success('Элементы шаблона добавлены')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(`Не удалось добавить: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Добавить из шаблона</DialogTitle>
          <DialogDescription>
            Выберите элементы шаблона проекта, которые нужно добавить. Уже
            добавленные задачи скрыты.
          </DialogDescription>
        </DialogHeader>

        {!templateId ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            У проекта не задан шаблон — добавлять нечего.
          </p>
        ) : !hasItems ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Все элементы шаблона уже добавлены в проект.
          </p>
        ) : (
          <TemplateItemsList
            title="Будут добавлены в проект:"
            docKitTemplates={docKitTemplates}
            formTemplates={formTemplates}
            threads={availableThreads}
            planBlocks={planContentBlocks}
            selectedDocKitIds={selectedDocKitIds}
            selectedFormIds={selectedFormIds}
            selectedThreadIds={selectedTaskIds}
            selectedBlockIds={selectedBlockIds}
            onToggleDocKit={toggle(setSelectedDocKitIds)}
            onToggleForm={toggle(setSelectedFormIds)}
            onToggleThread={toggle(setSelectedTaskIds)}
            onToggleBlock={toggle(setSelectedBlockIds)}
            disabled={saving}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleAdd} disabled={saving || !hasItems || totalSelected === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Добавить{totalSelected > 0 ? ` (${totalSelected})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
