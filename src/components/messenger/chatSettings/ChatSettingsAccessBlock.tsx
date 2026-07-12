import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ChatSettingsAccess } from '../ChatSettingsAccess'
import { ChatSettingsNotifications } from '../ChatSettingsNotifications'
import { PROJECT_ROLE_OPTIONS } from '../chatSettingsTypes'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { useChatSettingsFormState } from '../hooks/useChatSettingsFormState'
import type { useChatSettingsActions } from '../hooks/useChatSettingsActions'

type Form = ReturnType<typeof useChatSettingsFormState>
type Actions = ReturnType<typeof useChatSettingsActions>

/**
 * Сворачиваемый блок «Доступ и подписки» (кто видит чат + управление
 * подписчиками). Свёрнут по умолчанию — в шапке краткая сводка «кто видит».
 * Вынесено из ChatSettingsDialog (аудит 2026-07-13).
 */
export function ChatSettingsAccessBlock({
  form,
  actions,
  chat,
  userId,
  canManageSubscribers,
  hasProject,
}: {
  form: Form
  actions: Actions
  chat: ProjectThread | null
  userId?: string
  canManageSubscribers: boolean
  hasProject: boolean
}) {
  const [accessOpen, setAccessOpen] = useState(false)

  const accessSummary = useMemo(() => {
    if (form.accessType === 'all') return 'Все участники'
    if (form.accessType === 'roles') {
      if (form.selectedRoles.size === 0) return 'Роли не выбраны'
      return Array.from(form.selectedRoles)
        .map((r) => PROJECT_ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r)
        .join(', ')
    }
    const ids = form.isEditMode ? actions.memberIds : form.selectedMemberIds
    return ids.size === 0 ? 'Никто не выбран' : `${ids.size} участн.`
  }, [form.accessType, form.selectedRoles, form.isEditMode, form.selectedMemberIds, actions.memberIds])

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setAccessOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {accessOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">Доступ и подписки</span>
        {!accessOpen && (
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-[55%]">
            👁 {accessSummary}
          </span>
        )}
      </button>

      {accessOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          <ChatSettingsAccess
            participants={actions.effectiveParticipants}
            userId={userId}
            isEditMode={form.isEditMode}
            isTask={form.isTask}
            accessType={form.accessType}
            memberIds={actions.memberIds}
            selectedMemberIds={form.selectedMemberIds}
            selectedRoles={form.selectedRoles}
            onAccessChange={actions.handleAccessChange}
            onToggleMember={actions.handleToggleMember}
            onSetAccessType={form.setAccessType}
            onSetSelectedMemberIds={form.setSelectedMemberIds}
            onSetSelectedRoles={form.setSelectedRoles}
            hasProject={hasProject}
          />

          {chat && canManageSubscribers && (
            <ChatSettingsNotifications
              variant="manage"
              threadId={chat.id}
              workspaceId={chat.workspace_id}
              participants={actions.effectiveParticipants}
              canManage={canManageSubscribers}
              userId={userId}
            />
          )}
        </div>
      )}
    </div>
  )
}
