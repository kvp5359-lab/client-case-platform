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

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, EyeOff, Mail } from 'lucide-react'
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
import { PROJECT_ROLE_OPTIONS } from './chatSettingsTypes'
import type { TabMode } from './chatSettingsTypes'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { acc } from '@/lib/accentPalette'
import { ChatSettingsIconColorPicker } from './ChatSettingsIconColorPicker'
import { ChatSettingsProjectSelector } from './ChatSettingsProjectSelector'
import { ChatSettingsAssignees } from './ChatSettingsAssignees'
import { ChatSettingsAccess } from './ChatSettingsAccess'
import { ChatSettingsNotifications } from './ChatSettingsNotifications'
import { useWorkspacePermissions } from '@/hooks/permissions'
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
  const wsPerms = useWorkspacePermissions({ workspaceId: resolvedWorkspaceId })
  const canManageSubscribers = wsPerms.isOwner || wsPerms.can('manage_workspace_settings')
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

  // Отправка первого письма («Создать и отправить») требует получателя И тему.
  // Без первого сообщения тред создаётся как черновик — тему не требуем.
  const emailSendBlockReason =
    !form.isEditMode && form.tabMode === 'email' && form.hasInitialMessage
      ? form.selectedEmails.length === 0
        ? 'Укажите получателя письма'
        : !form.emailSubject.trim()
          ? 'Укажите тему письма'
          : null
      : null

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

  // Сворачиваемый блок «Доступ и подписки» — свёрнут по умолчанию (нужен реже,
  // чем «Исполнители»). В свёрнутом виде показываем краткую сводку «кто видит».
  const [accessOpen, setAccessOpen] = useState(false)
  // Email в режиме создания: получатель + тема + текст показываем единым блоком «Письмо».
  const isEmailCompose = form.channelType === 'email' && !form.isEditMode

  // Запоминаем иконку+цвет для каждого режима, чтобы возврат на вкладку восстановил
  // ТО, что было (в т.ч. дефолт из шаблона/канала), а не хардкод-цвет. Сбрасываем
  // при каждом открытии диалога.
  const modeLooks = useRef<Partial<Record<TabMode, { accent: ThreadAccentColor; icon: string }>>>({})
  useEffect(() => {
    if (open) modeLooks.current = {}
  }, [open])
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

  // Канал: для email-создания рендерится внутри блока «Письмо» (поля Кому/Тема),
  // для остальных — внизу окна (Подключить канал / личный канал / email-привязка).
  const channelBlock =
    isPersonalChannelThread && chat ? (
      <ChatSettingsChannelInfo
        thread={chat}
        workspaceId={chat.workspace_id}
        participants={actions.effectiveParticipants}
      />
    ) : form.isEditMode || form.tabMode !== 'task' ? (
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
    ) : null

  // Поле ввода первого сообщения (create mode). Без подписи — её ставим на месте.
  const composeField = !form.isEditMode ? (
    <>
      <ComposeField
        ref={composeRef}
        placeholder={form.tabMode === 'email' ? 'Текст письма...' : 'Сообщение (опционально)...'}
        editorMaxHeight={150}
        editorMinHeight={isEmailCompose ? 76 : undefined}
        initialHtml={actions.pendingInitialHtml}
        onChange={form.setHasInitialMessage}
        onFilesChange={setComposeFiles}
        onSubmit={
          form.canSave && !emailAttachmentsTooBig && !emailSendBlockReason
            ? () => actions.handleSave()
            : undefined
        }
        projectId={form.selectedProjectId ?? propProjectId}
        workspaceId={resolvedWorkspaceId}
        onOpenDocPicker={actions.composeProjectId ? actions.handleOpenDocPicker : undefined}
        projectDocumentsCount={actions.projectDocuments.length}
      />
      {emailAttachmentsTooBig && (
        <div className="flex items-start gap-2 px-2 py-1.5 mt-1 text-xs rounded-md bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Слишком большой объём вложений: {attachmentsLimitCheck.totalMb} МБ. За одно письмо
            принимается не больше 15 МБ. Удалите часть файлов или отправьте оставшиеся отдельным
            письмом.
          </span>
        </div>
      )}
    </>
  ) : null

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
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto overflow-x-hidden">
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
                if (t === form.tabMode) return
                // Запоминаем текущий вид для покидаемого режима (вернёмся — восстановим).
                modeLooks.current[form.tabMode] = { accent: form.accentColor, icon: form.icon }
                form.setTabMode(t)
                // Цвет/иконка: либо ранее запомненный для этого режима, либо дефолт.
                const remembered = modeLooks.current[t]
                if (remembered) {
                  form.setAccentColor(remembered.accent)
                  form.setIcon(remembered.icon)
                } else if (t === 'task') {
                  form.setAccentColor('slate')
                  form.setIcon('check-square')
                } else if (t === 'email') {
                  form.setAccentColor('rose')
                  form.setIcon('mail')
                } else {
                  form.setAccentColor('blue')
                  form.setIcon('message-square')
                }
                if (t === 'task') {
                  form.setTelegramChannelType('none')
                  form.setChannelExpanded(false)
                  const def = actions.taskStatuses.find((s) => s.is_default)
                  if (def) form.setTaskStatusId(def.id)
                } else if (t === 'email') {
                  form.setTelegramChannelType('none')
                  form.setChannelExpanded(false)
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

        <div className="flex flex-col gap-3 py-2 min-w-0">
          {/* Название */}
          <div className="flex flex-col gap-1 min-w-0">
            <Label htmlFor="chat-name" className="text-sm text-muted-foreground">
              Название
              {!form.isEditMode && form.channelType === 'email' && (
                <span className="text-muted-foreground font-normal ml-1">(опционально)</span>
              )}
            </Label>
            {/* Единая рамка «Название + Описание» (Gmail-стиль): название сверху,
                тонкий разделитель, описание ниже. Описание — внутренняя заметка
                команды (не уходит клиенту), одно поле для всех типов тредов. */}
            <div className="rounded-md border border-input bg-background overflow-hidden focus-within:border-ring">
              <div className="flex items-center">
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
              <div className="h-px bg-border" />
              <textarea
                value={form.description}
                onChange={(e) => form.setDescription(e.target.value)}
                placeholder="Описание — внутренняя заметка команды, клиент не видит…"
                rows={2}
                className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOff className="h-3 w-3 shrink-0" /> Описание видят только сотрудники
            </p>
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
              workspaceId={resolvedWorkspaceId}
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

          {/* Сообщение / письмо — единый блок со светлым акцентным фоном.
              Email-создание — блок «Письмо» (Кому/Тема/Текст); задача/чат — «Первое сообщение». */}
          {(isEmailCompose || composeField) && (
            <div className={`rounded-md p-3 space-y-3 ${acc.bgSoft(form.accentColor)}`}>
              {isEmailCompose ? (
                <>
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-muted-foreground" /> Письмо
                  </Label>
                  {channelBlock}
                  {composeField && (
                    <div className="flex flex-col gap-1 min-w-0">{composeField}</div>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-1 min-w-0">
                  <Label className="text-sm font-medium">Первое сообщение</Label>
                  {composeField}
                </div>
              )}
            </div>
          )}

          {/* ── Низ окна: доступ, канал, подписка ── */}

          {/* Доступ и подписки — сворачиваемый блок (кто видит чат + подписчики) */}
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

                {chat && canManageSubscribers && (
                  <ChatSettingsNotifications
                    variant="manage"
                    threadId={chat.id}
                    workspaceId={chat.workspace_id}
                    participants={actions.effectiveParticipants}
                    canManage={canManageSubscribers}
                    userId={user?.id}
                  />
                )}
              </div>
            )}
          </div>

          {/* Подключить канал / личный канал / email-привязка.
              Для email-создания каналы (Кому/Тема) живут в блоке «Письмо» выше. */}
          {!isEmailCompose && channelBlock}

          {/* Личная подписка — компактной кнопкой (edit mode) */}
          {chat && (
            <ChatSettingsNotifications
              variant="compact"
              threadId={chat.id}
              workspaceId={chat.workspace_id}
              participants={actions.effectiveParticipants}
              canManage={canManageSubscribers}
              userId={user?.id}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {form.isEditMode ? 'Закрыть' : 'Отмена'}
          </Button>
          {/* Email в режиме создания: «Сохранить черновик» создаёт тред без
              отправки — текст/файлы/тема/получатели переезжают в композер треда,
              письмо уйдёт при отправке оттуда. Защита от потери набранного при
              закрытии модалки. */}
          {!form.isEditMode && form.tabMode === 'email' && (
            <Button
              variant="outline"
              onClick={() => actions.handleSave({ asDraft: true })}
              disabled={isPending || emailAttachmentsTooBig}
            >
              Сохранить черновик
            </Button>
          )}
          {/* Отправка письма (есть первое сообщение) требует и получателя, и тему.
              Без сообщения «Создать» делает фактически черновик — тему не требуем. */}
          <span title={emailSendBlockReason ?? undefined} className="inline-flex">
            <Button
              onClick={() => actions.handleSave()}
              disabled={
                !form.canSave || isPending || emailAttachmentsTooBig || !!emailSendBlockReason
              }
            >
              {form.isEditMode
                ? 'Сохранить'
                : form.hasInitialMessage
                  ? 'Создать и отправить'
                  : 'Создать'}
            </Button>
          </span>
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
