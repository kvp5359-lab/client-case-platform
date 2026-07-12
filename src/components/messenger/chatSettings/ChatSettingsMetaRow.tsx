import { createElement } from 'react'
import { CircleDashed } from 'lucide-react'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getStatusIcon } from '@/components/common/status-icons'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ChatSettingsProjectSelector } from '../ChatSettingsProjectSelector'
import { ChatSettingsTimeRangePicker } from '../ChatSettingsTimeRangePicker'
import type { useChatSettingsFormState } from '../hooks/useChatSettingsFormState'
import type { useChatSettingsActions } from '../hooks/useChatSettingsActions'

type Form = ReturnType<typeof useChatSettingsFormState>
type Actions = ReturnType<typeof useChatSettingsActions>

/**
 * Строка «Срок · Статус-чип · Проект» одной линией. Статус-чип в стиле «Срок»
 * (светлая цветная плашка) открывает тот же выбор статуса, что точка в поле
 * названия. Вынесено из ChatSettingsDialog (аудит 2026-07-13).
 */
export function ChatSettingsMetaRow({
  form,
  actions,
  resolvedWorkspaceId,
}: {
  form: Form
  actions: Actions
  resolvedWorkspaceId?: string
}) {
  return (
    <div className="flex items-center gap-2 -mt-1">
      <ChatSettingsTimeRangePicker
        date={form.currentDlDate}
        startTime={form.taskStartTime}
        endTime={form.taskEndTime}
        endDate={form.taskEndDate}
        showDuration={form.taskShowDuration}
        onDateChange={actions.handleDeadlineSelect}
        onStartTimeChange={form.setTaskStartTime}
        onEndTimeChange={form.setTaskEndTime}
        onEndDateChange={form.setTaskEndDate}
        onShowDurationChange={form.setTaskShowDuration}
        onClear={actions.handleDeadlineClear}
      />
      {actions.taskStatuses.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={
                actions.currentStatus
                  ? 'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0 hover:brightness-95'
                  : 'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0 bg-muted/60 text-muted-foreground hover:bg-muted'
              }
              style={
                actions.currentStatus
                  ? {
                      backgroundColor: `color-mix(in srgb, ${safeCssColor(actions.currentStatus.color)} 14%, transparent)`,
                      color: `color-mix(in srgb, ${safeCssColor(actions.currentStatus.color)} 82%, black)`,
                    }
                  : undefined
              }
            >
              {actions.currentStatus ? (
                <>
                  {actions.currentStatus.icon ? (
                    createElement(getStatusIcon(actions.currentStatus.icon), {
                      className: 'w-3.5 h-3.5 shrink-0',
                    })
                  ) : (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: safeCssColor(actions.currentStatus.color) }}
                    />
                  )}
                  <span className="truncate max-w-[140px]">{actions.currentStatus.name}</span>
                </>
              ) : (
                <>
                  <CircleDashed className="w-3.5 h-3.5 shrink-0" />
                  <span>Статус</span>
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {actions.taskStatuses.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => actions.handleStatusSelect(s.id)}
                className="gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: safeCssColor(s.color) }}
                />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ChatSettingsProjectSelector
        workspaceProjects={actions.workspaceProjects}
        selectedProjectId={form.selectedProjectId}
        isEditMode={form.isEditMode}
        onSelect={actions.handleProjectSelect}
        workspaceId={resolvedWorkspaceId}
      />
    </div>
  )
}
