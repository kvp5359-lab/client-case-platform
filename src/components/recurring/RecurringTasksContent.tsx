'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { toast } from 'sonner'
import {
  useRecurringRules,
  useToggleRecurringRule,
  useDeleteRecurringRule,
} from '@/hooks/useRecurringRules'
import { RecurringRuleDialog } from '@/components/recurring/RecurringRuleDialog'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { describeSchedule } from '@/lib/recurring/schedule'
import type { RecurringRule } from '@/types/recurring'

function scheduleText(rule: RecurringRule): string {
  return describeSchedule({
    freq: rule.freq,
    byweekday: rule.byweekday,
    bymonthday: rule.bymonthday,
    fireTime: (rule.fire_time || '09:00').slice(0, 5),
    startsOn: rule.starts_on,
    untilDate: rule.until_date,
  })
}

function formatNext(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RecurringTasksContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: rules = [], isLoading } = useRecurringRules(workspaceId)
  const toggle = useToggleRecurringRule()
  const del = useDeleteRecurringRule()
  const { state, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRule | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (rule: RecurringRule) => {
    setEditing(rule)
    setDialogOpen(true)
  }

  const handleDelete = async (rule: RecurringRule) => {
    const ok = await confirm({
      title: 'Удалить правило повторения?',
      description: `«${rule.title}» больше не будет создавать задачи. Уже созданные задачи останутся.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    del.mutate(
      { id: rule.id, workspace_id: workspaceId },
      {
        onSuccess: () => toast.success('Правило удалено'),
        onError: () => toast.error('Не удалось удалить правило'),
      },
    )
  }

  const handleToggle = (rule: RecurringRule, next: boolean) => {
    toggle.mutate(
      { id: rule.id, workspace_id: workspaceId, is_active: next },
      { onError: () => toast.error('Не удалось изменить статус') },
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Повторяющиеся задачи</h2>
          <p className="text-sm text-muted-foreground">
            Задачи, которые создаются автоматически по расписанию
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Создать
        </Button>
      </div>

      {isLoading || rules.length === 0 ? (
        <EmptyState
          loading={isLoading}
          emptyText="Пока нет повторяющихся задач. Нажмите «Создать», чтобы задача появлялась по расписанию."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Задача</th>
                <th className="px-3 py-2 text-left font-medium">Расписание</th>
                <th className="px-3 py-2 text-left font-medium">Следующая</th>
                <th className="px-3 py-2 text-center font-medium">Создано</th>
                <th className="px-3 py-2 text-center font-medium">Активно</th>
                <th className="px-3 py-2 text-right font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const Icon = getChatIconComponent(rule.icon)
                return (
                  <tr key={rule.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{rule.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{scheduleText(rule)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {rule.is_active ? formatNext(rule.next_occurrence_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">
                      {rule.occurrences_count}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => handleToggle(rule, v)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(rule)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(rule)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <RecurringRuleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        workspaceId={workspaceId}
        rule={editing}
      />
      <ConfirmDialog state={state} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
