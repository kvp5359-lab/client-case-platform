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

import { useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { checkEmailAttachmentsLimit } from './hooks/useMessengerHandlers'
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
import { ChatSettingsChannelInfo } from './ChatSettingsChannelInfo'
import { ChatSettingsTimeRangePicker } from './ChatSettingsTimeRangePicker'
import { ChatSettingsStatusPopover } from './ChatSettingsStatusPopover'
import { useChatSettingsFormState } from './hooks/useChatSettingsFormState'
import { useChatSettingsActions } from './hooks/useChatSettingsActions'

// Re-export helpers used by WorkspaceLayout and other consumers
export { getChatIconComponent, getChatTabAccent } from './chatVisuals'
export type { ChatSettingsResult, ChatSettingsDialogProps } from './chatSettingsTypes'

// ── Main component ──

export function ChatSettingsDialog({
  chat,
  projectId: propProjectId,
  workspaceId: propWorkspaceId,
  defaultThreadType = 'chat',
  defaultTabMode,
  initialTemplate,
  initialValues,
  open,
  onOpenChange,
  onCreate,
  onUpdate,
  isPending,
}: ChatSettingsDialogProps) {
  const { user } = useAuth()
  const resolvedWorkspaceId = chat ? chat.workspace_id : propWorkspaceId
  const composeRef = useRef<ComposeFieldHandle>(null)

  // Личный диалог (без проекта), привязанный к каналу Wazzup / TG Business —
  // для него вместо «Подключить канал» показываем блок «Канал» с типом, номером
  // и передачей ответственного.
  const isPersonalChannelThread =
    !!chat &&
    chat.project_id === null &&
    (!!chat.wazzup_channel_id || !!chat.business_connection_id)

  // Файлы первого сообщения — для UI-проверки лимита email-вложений.
  // ComposeField пушит изменения через onFilesChange.
  const [composeFiles, setComposeFiles] = useState<File[]>([])
  const attachmentsLimitCheck = useMemo(
    () => checkEmailAttachmentsLimit(composeFiles),
    [composeFiles],
  )

  // ── Form state ──
  const form = useChatSettingsFormState({
    chat,
    propProjectId,
    propWorkspaceId,
    defaultThreadType,
    defaultTabMode,
    initialValues,
    open,
  })

  // Превышение актуально только для email-вкладки. Чат/задача — без лимита,
  // там вложения уходят в storage и не упираются в Gmail.
  const emailAttachmentsTooBig =
    form.tabMode === 'email' && !attachmentsLimitCheck.ok && composeFiles.length > 0

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
          {/* Название */}
          <div className="flex flex-col gap-1 min-w-0">
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

          {/* Срок + Проект — одной строкой chip-ами */}
          <div className="flex items-center gap-2 flex-wrap">
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
            <ChatSettingsProjectSelector
              workspaceProjects={actions.workspaceProjects}
              selectedProjectId={form.selectedProjectId}
              isEditMode={form.isEditMode}
              onSelect={actions.handleProjectSelect}
            />
          </div>

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
            hasProject={!!(form.selectedProjectId ?? propProjectId)}
          />

          {/* Канал личного диалога (Wazzup / TG Business): показываем тип + номер
              + передачу ответственному. Для таких тредов блок «Подключить канал»
              ниже не нужен — канал уже подключён. */}
          {isPersonalChannelThread && chat ? (
            <ChatSettingsChannelInfo
              thread={chat}
              workspaceId={chat.workspace_id}
              participants={actions.effectiveParticipants}
            />
          ) : (
          /* Каналы */
          (form.isEditMode || form.tabMode !== 'task') && (
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
          )
          )}
        </div>

        {/* First message compose (create mode only) */}
        {!form.isEditMode && (
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm text-muted-foreground">Первое сообщение</label>
            <ComposeField
              ref={composeRef}
              placeholder={
                form.tabMode === 'email' ? 'Текст письма...' : 'Сообщение (опционально)...'
              }
              editorMaxHeight={150}
              initialHtml={actions.pendingInitialHtml}
              onChange={form.setHasInitialMessage}
              onFilesChange={setComposeFiles}
              onSubmit={form.canSave && !emailAttachmentsTooBig ? actions.handleSave : undefined}
              projectId={form.selectedProjectId ?? propProjectId}
              workspaceId={resolvedWorkspaceId}
              onOpenDocPicker={actions.composeProjectId ? actions.handleOpenDocPicker : undefined}
              projectDocumentsCount={actions.projectDocuments.length}
            />
            {/* Предупреждение о превышении лимита email-вложений — показываем
                под полем ввода в момент превышения, не после отправки. */}
            {emailAttachmentsTooBig && (
              <div className="flex items-start gap-2 px-2 py-1.5 mt-1 text-xs rounded-md bg-red-50 text-red-700 border border-red-200">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Слишком большой объём вложений: {attachmentsLimitCheck.totalMb} МБ. За одно
                  письмо принимается не больше 15 МБ. Удалите часть файлов или отправьте
                  оставшиеся отдельным письмом.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {form.isEditMode ? 'Закрыть' : 'Отмена'}
          </Button>
          <Button
            onClick={actions.handleSave}
            disabled={!form.canSave || isPending || emailAttachmentsTooBig}
          >
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
