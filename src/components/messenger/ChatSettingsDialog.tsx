/**
 * Единый диалог создания / редактирования чата.
 * Объединяет: CreateChatDialog + EditChatDialog + ChatAccessDialog + Email link.
 *
 * Подкомпоненты:
 *  - ChatSettingsIconColorPicker — popover выбора иконки и цвета
 *  - ChatSettingsProjectSelector — popover выбора проекта
 *  - ChatSettingsAssignees — секция исполнителей (задачи)
 *  - ChatSettingsAccess — секция доступа
 *  - ChatSettingsChannels — Telegram + Email каналы
 *  - ChatSettingsDeadlinePicker — попоувер выбора срока
 *  - ChatSettingsStatusPopover — попоувер статуса в поле названия
 *  - hooks/useChatSettingsFormState — состояние формы
 *  - hooks/useChatSettingsActions — все хендлеры и запросы данных
 */

import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ComposeField, type ComposeFieldHandle } from './ComposeField'
import { DocumentPickerDialog } from './DocumentPickerDialog'
import { useAuth } from '@/contexts/AuthContext'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { ThreadTemplatePicker } from './ThreadTemplatePicker'

import type { ChatSettingsDialogProps } from './chatSettingsTypes'
import { ChatSettingsIconColorPicker } from './ChatSettingsIconColorPicker'
import { ChatSettingsProjectSelector } from './ChatSettingsProjectSelector'
import { ChatSettingsAssignees } from './ChatSettingsAssignees'
import { ChatSettingsAccess } from './ChatSettingsAccess'
import { ChatSettingsChannels } from './ChatSettingsChannels'
import { ChatSettingsDeadlinePicker } from './ChatSettingsDeadlinePicker'
import { ChatSettingsStatusPopover } from './ChatSettingsStatusPopover'
import { useChatSettingsFormState } from './hooks/useChatSettingsFormState'
import { useChatSettingsActions } from './hooks/useChatSettingsActions'

// Re-export helpers used by WorkspaceLayout and other consumers
export { getChatIconComponent, getChatTabAccent } from './EditChatDialog'
export type { ChatSettingsResult, ChatSettingsDialogProps } from './chatSettingsTypes'

// ── Main component ──

export function ChatSettingsDialog({
  chat,
  projectId: propProjectId,
  workspaceId: propWorkspaceId,
  defaultThreadType = 'chat',
  defaultTabMode,
  initialTemplate,
  open,
  onOpenChange,
  onCreate,
  onUpdate,
  isPending,
}: ChatSettingsDialogProps) {
  const { user } = useAuth()
  const resolvedWorkspaceId = chat ? chat.workspace_id : propWorkspaceId
  const composeRef = useRef<ComposeFieldHandle>(null)

  // ── Form state ──
  const form = useChatSettingsFormState({
    chat,
    propProjectId,
    propWorkspaceId,
    defaultThreadType,
    defaultTabMode,
    open,
  })

  // ── Actions, data queries, handlers ──
  const actions = useChatSettingsActions({
    chat,
    propProjectId,
    resolvedWorkspaceId,
    open,
    form,
    composeRef,
    initialTemplate,
    userId: user?.id,
    onCreate,
    onUpdate,
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v && !form.isEditMode) {
          form.reset()
          composeRef.current?.clear()
        }
      }}
    >
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="mr-1">
              {form.isEditMode ? 'Настройки' : form.isTask ? 'Новая' : 'Новый'}
            </span>
            <SegmentedToggle
              options={[
                { value: 'task' as const, label: 'Задача' },
                { value: 'chat' as const, label: 'Чат' },
                { value: 'email' as const, label: 'Email' },
              ]}
              value={form.tabMode}
              onChange={(t) => {
                form.setTabMode(t)
                if (t === 'task') {
                  form.setAccentColor('slate')
                  form.setIcon('check-square')
                  form.setTelegramChannelType('none')
                  form.setChannelExpanded(false)
                  const def = actions.taskStatuses.find((s) => s.is_default)
                  if (def) form.setTaskStatusId(def.id)
                } else if (t === 'email') {
                  form.setAccentColor('rose')
                  form.setIcon('mail')
                  form.setTelegramChannelType('none')
                  form.setChannelExpanded(false)
                } else {
                  form.setAccentColor('blue')
                  form.setIcon('message-square')
                }
              }}
              size="md"
            />
            {!form.isEditMode && (
              <ThreadTemplatePicker
                workspaceId={resolvedWorkspaceId}
                projectId={form.selectedProjectId ?? propProjectId}
                onSelect={actions.handleApplyTemplate}
              />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {/* Название + Срок */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <Label htmlFor="chat-name" className="text-sm text-muted-foreground">
                Название
                {!form.isEditMode && form.channelType === 'email' && (
                  <span className="text-muted-foreground font-normal ml-1">(опционально)</span>
                )}
              </Label>
              <div className="flex items-center rounded-md border border-input bg-background">
                <ChatSettingsStatusPopover
                  taskStatuses={actions.taskStatuses}
                  currentStatusId={form.currentStatusId}
                  currentStatus={actions.currentStatus}
                  statusPopoverOpen={form.statusPopoverOpen}
                  onOpenChange={form.setStatusPopoverOpen}
                  onSelect={actions.handleStatusSelect}
                />
                <input
                  id="chat-name"
                  value={form.name}
                  onChange={(e) => {
                    form.setName(e.target.value)
                    if (form.channelType === 'email' && !form.subjectTouched) {
                      form.setEmailSubject(e.target.value)
                    }
                  }}
                  placeholder={
                    !form.isEditMode && form.channelType === 'email'
                      ? 'По умолчанию: тема или email'
                      : form.isTask
                        ? 'Название задачи'
                        : 'Название чата'
                  }
                  autoFocus={form.isEditMode || form.channelType !== 'email'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && form.canSave) actions.handleSave()
                  }}
                  className="flex-1 min-w-0 h-9 pl-1 pr-2 py-1 text-[15px] font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40 placeholder:font-normal"
                />
                <ChatSettingsIconColorPicker
                  accentColor={form.accentColor}
                  icon={form.icon}
                  onAccentColorChange={form.setAccentColor}
                  onIconChange={form.setIcon}
                />
              </div>
            </div>

            <ChatSettingsDeadlinePicker
              currentDl={form.currentDl}
              currentDlDate={form.currentDlDate}
              isEditMode={form.isEditMode}
              deadlinePopoverOpen={form.deadlinePopoverOpen}
              onOpenChange={form.setDeadlinePopoverOpen}
              onSelect={actions.handleDeadlineSelect}
              onClear={actions.handleDeadlineClear}
            />
          </div>

          {/* Проект */}
          <ChatSettingsProjectSelector
            workspaceProjects={actions.workspaceProjects}
            selectedProjectId={form.selectedProjectId}
            isEditMode={form.isEditMode}
            onSelect={actions.handleProjectSelect}
          />

          {/* Исполнители (для задач, чатов, email) */}
          <ChatSettingsAssignees
            participants={actions.effectiveParticipants}
            userId={user?.id}
            isEditMode={form.isEditMode}
            editAssigneeSet={actions.editAssigneeSet}
            taskAssignees={form.taskAssignees}
            onToggleEditAssignee={actions.toggleAssignee.mutate}
            onSetTaskAssignees={form.setTaskAssignees}
          />

          {/* Доступ */}
          <ChatSettingsAccess
            participants={actions.effectiveParticipants}
            userId={user?.id}
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
          />

          {/* Каналы */}
          {(form.isEditMode || form.tabMode !== 'task') && (
            <ChatSettingsChannels
              tabMode={form.tabMode}
              channelType={form.channelType}
              isEditMode={form.isEditMode}
              isTelegramLinked={actions.isTelegramLinked}
              telegramLink={actions.telegramLink}
              telegramLinkCode={actions.telegramLinkCode}
              isTelegramCodeLoading={actions.isTelegramCodeLoading}
              isTelegramUnlinking={actions.isTelegramUnlinking}
              telegramCopied={actions.telegramCopied}
              onUnlinkTelegram={actions.unlinkTelegram}
              onCopyTelegramCode={actions.handleCopyTelegramCode}
              channelExpanded={form.channelExpanded}
              telegramChannelType={form.telegramChannelType}
              onSetChannelExpanded={form.setChannelExpanded}
              onSetTelegramChannelType={form.setTelegramChannelType}
              emailLink={actions.emailLink}
              onLinkEmail={actions.handleLinkEmail}
              onUnlinkEmail={actions.handleUnlinkEmail}
              isLinkingEmail={actions.isLinkingEmail}
              isUnlinkingEmail={actions.isUnlinkingEmail}
              selectedEmails={form.selectedEmails}
              emailInput={form.emailInput}
              emailSubject={form.emailSubject}
              subjectTouched={form.subjectTouched}
              emailSuggestions={actions.emailSuggestions}
              filteredSuggestions={actions.filteredSuggestions}
              emailDropdownOpen={form.emailDropdownOpen}
              onSetSelectedEmails={form.setSelectedEmails}
              onSetEmailInput={form.setEmailInput}
              onSetEmailSubject={form.setEmailSubject}
              onSetSubjectTouched={form.setSubjectTouched}
              onSetEmailDropdownOpen={form.setEmailDropdownOpen}
            />
          )}
        </div>

        {/* First message compose (create mode only) */}
        {!form.isEditMode && (
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Первое сообщение</label>
            <ComposeField
              ref={composeRef}
              placeholder={
                form.tabMode === 'email' ? 'Текст письма...' : 'Сообщение (опционально)...'
              }
              editorMaxHeight={150}
              onChange={form.setHasInitialMessage}
              onSubmit={form.canSave ? actions.handleSave : undefined}
              projectId={form.selectedProjectId ?? propProjectId}
              workspaceId={resolvedWorkspaceId}
              onOpenDocPicker={actions.composeProjectId ? actions.handleOpenDocPicker : undefined}
              projectDocumentsCount={actions.projectDocuments.length}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {form.isEditMode ? 'Закрыть' : 'Отмена'}
          </Button>
          <Button onClick={actions.handleSave} disabled={!form.canSave || isPending}>
            {form.isEditMode
              ? 'Сохранить'
              : form.hasInitialMessage
                ? 'Создать и отправить'
                : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Document picker for compose field attachments */}
      <DocumentPickerDialog
        key={actions.docPickerKey}
        open={actions.docPickerOpen}
        onOpenChange={actions.setDocPickerOpen}
        documents={actions.projectDocuments}
        statusMap={actions.docStatusMap}
        onConfirm={actions.handleConfirmDocPicker}
        isLoading={actions.isDocDownloading}
      />
    </Dialog>
  )
}
