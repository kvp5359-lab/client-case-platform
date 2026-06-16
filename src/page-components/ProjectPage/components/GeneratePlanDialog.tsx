"use client"

/**
 * Модалка «Сформировать план» (вкладка «Задачи» проекта).
 *
 * Собирает текстовый план выполнения: задачи с разделителями (heading/text
 * блоки плана) + слоты документов, сгруппированные по наборам документов.
 * Текст строит чистая функция buildProjectPlanLines; здесь — загрузка данных,
 * настройки (вывод исполнителей), редактирование в общем Tiptap-редакторе и
 * кнопка «Копировать».
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { MinimalTiptapEditor, MessengerToolbar } from '@/components/messenger/MinimalTiptapEditor'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useTaskStatuses, useDocumentStatuses } from '@/hooks/useStatuses'
import { useProjectPlan } from '@/hooks/plan/useProjectPlan'
import { useDocumentKitsQuery } from '@/hooks/documents/useDocumentKitsQuery'
import { useFolderSlots } from '@/hooks/documents/useFolderSlots'
import { useTaskAssigneesMap } from '@/components/tasks/useTaskAssignees'
import { htmlToPlain } from '@/components/plan/PlanBlockItem'
import {
  buildProjectPlanLines,
  planLinesToHtml,
  type PlanBlockInput,
  type PlanKitInput,
} from '@/lib/projectPlanText'

type GeneratePlanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
}

/** Внутренность монтируется только когда модалка открыта — хуки грузятся лениво. */
function GeneratePlanContent({
  projectId,
  workspaceId,
}: {
  projectId: string
  workspaceId: string
}) {
  const { data: threads = [] } = useProjectThreads(projectId)
  const { blocks } = useProjectPlan(projectId, workspaceId)
  const { data: kits = [] } = useDocumentKitsQuery(projectId, true)
  const { slots } = useFolderSlots(projectId)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const { data: documentStatuses = [] } = useDocumentStatuses(workspaceId)

  const taskIds = useMemo(
    () => threads.filter((t) => !t.is_deleted && t.type === 'task').map((t) => t.id),
    [threads],
  )
  const { data: assigneesMap = {} } = useTaskAssigneesMap(taskIds)

  const [showAssignees, setShowAssignees] = useState(false)
  const [copied, setCopied] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  const finalStatusIds = useMemo(
    () => new Set(taskStatuses.filter((s) => s.is_final).map((s) => s.id)),
    [taskStatuses],
  )
  const docStatusName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of documentStatuses) m.set(s.id, s.name)
    return m
  }, [documentStatuses])

  const planHtml = useMemo(() => {
    const tasks = threads
      .filter((t) => !t.is_deleted && t.type === 'task')
      .map((t) => {
        const names = (assigneesMap[t.id] ?? [])
          .map((a) => `${a.name} ${a.last_name ?? ''}`.trim())
          .filter(Boolean)
        const name =
          showAssignees && names.length ? `${t.name} (${names.join(', ')})` : t.name
        return {
          id: t.id,
          name,
          sort_order: t.sort_order ?? 0,
          done: !!t.status_id && finalStatusIds.has(t.status_id),
        }
      })

    const textBlocks: PlanBlockInput[] = blocks
      .filter((b) => b.block_type === 'heading' || b.block_type === 'text')
      .map((b) => ({
        id: b.id,
        block_type: b.block_type as 'heading' | 'text',
        content: b.content,
        sort_order: b.sort_order,
      }))

    const kitsInput: PlanKitInput[] = kits.map((k) => ({
      id: k.id,
      name: k.name,
      sort_order: k.sort_order ?? 0,
      folders: (k.folders ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        sort_order: f.sort_order ?? 0,
      })),
    }))

    const slotsInput = slots.map((s) => {
      // Статус загруженного документа: имя статуса из справочника, иначе «Загружен».
      const loadedStatus = s.document_id
        ? (s.document?.status ? docStatusName.get(s.document.status) : undefined) ?? 'Загружен'
        : null
      return {
        id: s.id,
        name: s.name,
        folder_id: s.folder_id,
        sort_order: s.sort_order ?? 0,
        loadedStatus,
      }
    })

    const lines = buildProjectPlanLines({
      tasks,
      blocks: textBlocks,
      kits: kitsInput,
      slots: slotsInput,
      htmlToPlain,
    })
    return planLinesToHtml(lines)
  }, [
    threads,
    blocks,
    kits,
    slots,
    finalStatusIds,
    docStatusName,
    assigneesMap,
    showAssignees,
  ])

  // Сеем сгенерированный план в редактор. Перезаписываем только при смене
  // самого плана (данные/настройки) — ручные правки между сменами сохраняются,
  // т.к. набор текста planHtml не меняет.
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(planHtml)
  }, [editor, planHtml])

  const handleCopy = async () => {
    const text = editor?.getText() ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('План скопирован')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  return (
    <>
      {/* Строка настроек */}
      <div className="flex items-center gap-2">
        <Switch id="plan-show-assignees" checked={showAssignees} onCheckedChange={setShowAssignees} />
        <Label htmlFor="plan-show-assignees" className="cursor-pointer">
          Выводить исполнителей
        </Label>
      </div>

      {/* Редактируемый план в общем Tiptap-редакторе */}
      <div className="rounded-md border">
        <div className="px-2 py-3">
          <MinimalTiptapEditor
            onSend={() => {}}
            placeholder="План пуст"
            editorRef={editorRef}
            onEditorReady={setEditor}
            editorMaxHeight={420}
          />
        </div>
        {editor && (
          <div className="border-t px-2 py-1">
            <MessengerToolbar editor={editor} />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={handleCopy} className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </DialogFooter>
    </>
  )
}

export function GeneratePlanDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
}: GeneratePlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>План выполнения</DialogTitle>
          <DialogDescription>
            Задачи с разделителями и слоты документов по наборам документов.
          </DialogDescription>
        </DialogHeader>
        {open && <GeneratePlanContent projectId={projectId} workspaceId={workspaceId} />}
      </DialogContent>
    </Dialog>
  )
}
