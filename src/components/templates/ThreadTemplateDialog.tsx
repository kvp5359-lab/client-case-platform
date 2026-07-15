/**
 * Диалог создания / редактирования шаблона треда.
 * Визуально похож на ChatSettingsDialog, но с отличиями:
 * - Название шаблона + описание (мета-поля)
 * - Дедлайн = "через N дней" (число), а не конкретная дата
 * - Исполнители = участники workspace (а не проекта)
 * - Нет выбора проекта и Telegram
 */

import { useThreadTemplateForm } from './useThreadTemplateForm'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { useTaskStatuses, useProjectStatusesForTemplate } from '@/hooks/useStatuses'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'
import { ThreadTemplateFields } from './ThreadTemplateFields'
import type { EmailChip } from './EmailRecipientInput'
import { useEmailChips } from '@/hooks/messenger/useEmailChips'

// ── Props ──

type ThreadTemplateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  template: ThreadTemplate | null // null = create
  /** Принудительно использовать этот project_template_id для подбора набора
   *  статусов проекта в селекторе автоперехода. Нужен в редакторе шаблона
   *  проекта при создании НОВОГО шаблона задачи (template=null), когда мы
   *  ещё не можем взять `template.owner_project_template_id`. */
  ownerProjectTemplateIdOverride?: string | null
  /** Скрыть блок «Исполнители» — когда ими управляет вызывающий экран
   *  (см. ThreadTemplateFieldsProps.hideAssignees). */
  hideAssignees?: boolean
  onSave: (data: ThreadTemplateFormData) => void
  isPending?: boolean
}

export function ThreadTemplateDialog({
  open,
  onOpenChange,
  workspaceId,
  template,
  ownerProjectTemplateIdOverride,
  hideAssignees,
  onSave,
  isPending,
}: ThreadTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto">
        {open && (
          <ThreadTemplateDialogBody
            key={template?.id ?? 'create'}
            workspaceId={workspaceId}
            template={template}
            ownerProjectTemplateIdOverride={ownerProjectTemplateIdOverride}
            hideAssignees={hideAssignees}
            onSave={onSave}
            isPending={isPending}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ThreadTemplateDialogBody({
  workspaceId,
  template,
  ownerProjectTemplateIdOverride,
  hideAssignees,
  onSave,
  isPending,
  onClose,
}: {
  workspaceId: string
  template: ThreadTemplate | null
  ownerProjectTemplateIdOverride?: string | null
  hideAssignees?: boolean
  onSave: (data: ThreadTemplateFormData) => void
  isPending?: boolean
  onClose: () => void
}) {
  const isEdit = !!template

  // Data
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  // Project-статусы для селектора «при завершении задачи перевести проект в…».
  // Если шаблон принадлежит шаблону проекта (owner_project_template_id) —
  // показываем статусы этого шаблона (с фолбэком на общие). Если шаблон
  // глобальный — только общие статусы воркспейса.
  const ownerProjectTemplateId =
    ownerProjectTemplateIdOverride ?? template?.owner_project_template_id ?? null
  const { data: projectStatuses = [] } = useProjectStatusesForTemplate(
    workspaceId,
    ownerProjectTemplateId,
  )
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const { data: workspaceProjects = [] } = useWorkspaceProjects(workspaceId)

  // Email chips
  const initialEmails: EmailChip[] = (template?.default_contact_email ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => ({ email: e, label: e }))

  const {
    enrichedEmails,
    emailInput,
    setEmailInput,
    emailDropdownOpen,
    setEmailDropdownOpen,
    filteredEmailSuggestions,
    addChip,
    removeChip,
    removeLast,
  } = useEmailChips(initialEmails, participants)

  // Form state + derived + actions — вынесены в useThreadTemplateForm
  const {
    templateName,
    setTemplateName,
    description,
    setDescription,
    tabMode,
    threadNameTemplate,
    setThreadNameTemplate,
    accentColor,
    setAccentColor,
    icon,
    setIcon,
    accessType,
    setAccessType,
    selectedRoles,
    statusId,
    setStatusId,
    defaultProjectId,
    setDefaultProjectId,
    defaultDescription,
    setDefaultDescription,
    onCompleteStatusId,
    setOnCompleteStatusId,
    deadlineDays,
    setDeadlineDays,
    assigneeIds,
    emailSubject,
    setEmailSubject,
    initialMessageHtml,
    setInitialMessageHtml,
    isTask,
    isEmail,
    canSave,
    isProjectMode,
    deadlineOverridden,
    messageOverridden,
    accessOverridden,
    assigneesOverridden,
    toggleDeadlineOverride,
    toggleMessageOverride,
    toggleAccessOverride,
    toggleAssigneesOverride,
    handleTabChange,
    handleSave,
    toggleAssignee,
    toggleRole,
  } = useThreadTemplateForm({ template, onSave, taskStatuses, enrichedEmails })

  // Пер-проектные переопределения полей (только когда шаблон открыт из редактора
  // типа проекта). Общие поля (имя/иконка/название/тип) правятся как есть.
  const projectOverrideCtl = isProjectMode
    ? {
        deadline: { active: deadlineOverridden, onToggle: toggleDeadlineOverride },
        message: { active: messageOverridden, onToggle: toggleMessageOverride },
        access: { active: accessOverridden, onToggle: toggleAccessOverride },
        assignees: { active: assigneesOverridden, onToggle: toggleAssigneesOverride },
      }
    : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="mr-1">{isEdit ? 'Редактировать' : 'Новый'} шаблон</span>
          <SegmentedToggle
            options={[
              { value: 'task' as const, label: 'Задача' },
              { value: 'chat' as const, label: 'Чат' },
              { value: 'email' as const, label: 'Email' },
            ]}
            value={tabMode}
            onChange={handleTabChange}
            size="md"
          />
        </DialogTitle>
      </DialogHeader>

      {isProjectMode && (
        <p className="text-xs text-muted-foreground px-1 -mt-1">
          Имя, иконка и название — общие для всех типов проекта.{' '}
          {hideAssignees ? 'Срок' : 'Исполнителей, срок'}, сообщение и доступ можно
          настроить индивидуально для этого типа.
        </p>
      )}

      <div className="py-2">
        <ThreadTemplateFields
          workspaceId={workspaceId}
          projectOverride={projectOverrideCtl}
          isTask={isTask}
          isEmail={isEmail}
          hideAssignees={hideAssignees}
          showTemplateName
          templateName={templateName}
          onTemplateNameChange={setTemplateName}
          description={description}
          onDescriptionChange={setDescription}
          threadNameTemplate={threadNameTemplate}
          onThreadNameChange={setThreadNameTemplate}
          taskStatuses={taskStatuses}
          statusId={statusId}
          onStatusChange={setStatusId}
          accentColor={accentColor}
          onAccentColorChange={setAccentColor}
          icon={icon}
          onIconChange={setIcon}
          taskStyleThreadBlock
          defaultDescription={defaultDescription}
          onDefaultDescriptionChange={setDefaultDescription}
          showDefaultProject
          workspaceProjects={workspaceProjects}
          defaultProjectId={defaultProjectId}
          onDefaultProjectChange={setDefaultProjectId}
          showDeadlineDays
          deadlineDays={deadlineDays}
          onDeadlineDaysChange={setDeadlineDays}
          showOnComplete
          projectStatuses={projectStatuses}
          onCompleteStatusId={onCompleteStatusId}
          onOnCompleteStatusChange={setOnCompleteStatusId}
          participants={participants}
          assigneeIds={assigneeIds}
          onToggleAssignee={toggleAssignee}
          accessType={accessType}
          onAccessTypeChange={setAccessType}
          selectedRoles={selectedRoles}
          onToggleRole={toggleRole}
          email={{
            chips: enrichedEmails,
            inputValue: emailInput,
            dropdownOpen: emailDropdownOpen,
            suggestions: filteredEmailSuggestions,
            onInputChange: setEmailInput,
            onDropdownOpenChange: setEmailDropdownOpen,
            onAddChip: addChip,
            onRemoveChip: removeChip,
            onRemoveLast: removeLast,
            subject: emailSubject,
            onSubjectChange: setEmailSubject,
          }}
          initialMessageHtml={initialMessageHtml}
          onInitialMessageChange={setInitialMessageHtml}
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={!canSave || isPending}>
          {isPending ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
        </Button>
      </DialogFooter>
    </>
  )
}
