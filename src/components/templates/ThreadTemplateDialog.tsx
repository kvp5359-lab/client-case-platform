/**
 * Диалог создания / редактирования шаблона треда.
 * Визуально похож на ChatSettingsDialog, но с отличиями:
 * - Название шаблона + описание (мета-поля)
 * - Дедлайн = "через N дней" (число), а не конкретная дата
 * - Исполнители = участники workspace (а не проекта)
 * - Нет выбора проекта и Telegram
 */

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Users, UserCheck } from 'lucide-react'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate, ThreadTemplateFormData } from '@/types/threadTemplate'
import { IconColorPicker } from './IconColorPicker'
import { StatusPicker } from './StatusPicker'
import { AssigneesPicker } from './AssigneesPicker'
import { EmailRecipientInput } from './EmailRecipientInput'
import type { EmailChip } from './EmailRecipientInput'
import { useEmailChips } from '@/hooks/messenger/useEmailChips'

const PROJECT_ROLE_OPTIONS = [
  { value: 'Администратор', label: 'Администраторы' },
  { value: 'Исполнитель', label: 'Исполнители' },
  { value: 'Клиент', label: 'Клиенты' },
  { value: 'Участник', label: 'Наблюдатели' },
] as const

type TabMode = 'task' | 'chat' | 'email'

// ── Props ──

interface ThreadTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  template: ThreadTemplate | null // null = create
  onSave: (data: ThreadTemplateFormData) => void
  isPending?: boolean
}

export function ThreadTemplateDialog({
  open,
  onOpenChange,
  workspaceId,
  template,
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
  onSave,
  isPending,
  onClose,
}: {
  workspaceId: string
  template: ThreadTemplate | null
  onSave: (data: ThreadTemplateFormData) => void
  isPending?: boolean
  onClose: () => void
}) {
  const isEdit = !!template

  // Data
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)

  // ── Form state (initialized from template) ──
  const [templateName, setTemplateName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [tabMode, setTabMode] = useState<TabMode>(
    template
      ? template.is_email
        ? 'email'
        : template.thread_type === 'task'
          ? 'task'
          : 'chat'
      : 'chat',
  )
  const [threadNameTemplate, setThreadNameTemplate] = useState(template?.thread_name_template ?? '')
  const [accentColor, setAccentColor] = useState<ThreadAccentColor>(
    template?.accent_color ?? 'blue',
  )
  const [icon, setIcon] = useState(template?.icon ?? 'message-square')
  const [accessType, setAccessType] = useState<'all' | 'roles'>(template?.access_type ?? 'all')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(template?.access_roles ?? []),
  )
  const [statusId, setStatusId] = useState<string | null>(template?.default_status_id ?? null)
  const [deadlineDays, setDeadlineDays] = useState<string>(
    template?.deadline_days != null ? String(template.deadline_days) : '',
  )
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(
    new Set((template?.thread_template_assignees ?? []).map((a) => a.participant_id)),
  )
  const [emailSubject, setEmailSubject] = useState(template?.email_subject_template ?? '')
  const [initialMessageHtml, setInitialMessageHtml] = useState(template?.initial_message_html ?? '')

  // UI state
  const [iconColorOpen, setIconColorOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')

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

  // ── Tab change side effects ──
  const handleTabChange = useCallback(
    (t: TabMode) => {
      setTabMode(t)
      if (t === 'task') {
        setAccentColor('slate')
        setIcon('check-square')
        const def = taskStatuses.find((s) => s.is_default)
        if (def && !statusId) setStatusId(def.id)
      } else if (t === 'email') {
        setAccentColor('blue')
        setIcon('mail')
      } else {
        setAccentColor('blue')
        setIcon('message-square')
      }
    },
    [taskStatuses, statusId],
  )

  const isTask = tabMode === 'task'
  const isEmail = tabMode === 'email'
  const canSave = templateName.trim().length > 0

  // ── Submit ──
  const handleSave = useCallback(() => {
    if (!canSave) return
    const days = deadlineDays.trim() ? parseInt(deadlineDays, 10) : null
    onSave({
      name: templateName.trim(),
      description: description.trim() || '',
      thread_type: isTask ? 'task' : 'chat',
      is_email: isEmail,
      thread_name_template: threadNameTemplate.trim() || '',
      accent_color: accentColor,
      icon,
      access_type: accessType,
      access_roles: accessType === 'roles' ? Array.from(selectedRoles) : [],
      default_status_id: isTask ? statusId : null,
      deadline_days: isTask && days != null && !isNaN(days) ? days : null,
      assignee_ids: isTask ? Array.from(assigneeIds) : [],
      default_contact_email: isEmail ? enrichedEmails.map((e) => e.email).join(', ') : '',
      email_subject_template: isEmail ? emailSubject.trim() : '',
      initial_message_html: initialMessageHtml.trim() || '',
    })
  }, [
    canSave,
    templateName,
    description,
    isTask,
    isEmail,
    threadNameTemplate,
    accentColor,
    icon,
    accessType,
    selectedRoles,
    statusId,
    deadlineDays,
    assigneeIds,
    enrichedEmails,
    emailSubject,
    initialMessageHtml,
    onSave,
  ])

  const toggleAssignee = useCallback((id: string) => {
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleRole = useCallback((role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

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

      <div className="flex flex-col gap-3 py-2">
        {/* Название шаблона */}
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Название шаблона *</Label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Например: Запрос документов"
            autoFocus
          />
        </div>

        {/* Описание */}
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Описание</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание шаблона"
          />
        </div>

        <hr className="border-dashed" />

        {/* Название треда (шаблон) + Статус (task) + Иконка/Цвет */}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <Label className="text-sm text-muted-foreground">
              Название треда
              <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
                {'({project_name}, {date})'}
              </span>
            </Label>
            <Input
              value={threadNameTemplate}
              onChange={(e) => setThreadNameTemplate(e.target.value)}
              placeholder={
                isTask
                  ? 'Проверка анкеты: {project_name}'
                  : isEmail
                    ? 'Запрос: {project_name}'
                    : 'Обсуждение: {project_name}'
              }
            />
          </div>

          {isTask && (
            <StatusPicker
              open={statusOpen}
              onOpenChange={setStatusOpen}
              statuses={taskStatuses}
              statusId={statusId}
              onStatusChange={setStatusId}
            />
          )}

          <IconColorPicker
            open={iconColorOpen}
            onOpenChange={setIconColorOpen}
            accentColor={accentColor}
            icon={icon}
            onColorChange={setAccentColor}
            onIconChange={setIcon}
          />
        </div>

        {/* Дедлайн (задачи) */}
        {isTask && (
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">Дедлайн</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                className="w-24"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(e.target.value)}
                placeholder="—"
              />
              <span className="text-sm text-muted-foreground">дней после создания</span>
            </div>
          </div>
        )}

        {/* Исполнители (задачи) */}
        {isTask && (
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">Исполнители</Label>
            <AssigneesPicker
              open={assigneeOpen}
              onOpenChange={setAssigneeOpen}
              participants={participants}
              assigneeIds={assigneeIds}
              onToggle={toggleAssignee}
              search={assigneeSearch}
              onSearchChange={setAssigneeSearch}
            />
          </div>
        )}

        {/* Доступ */}
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Доступ</Label>
          <div className="flex gap-2">
            <Button
              variant={accessType === 'all' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setAccessType('all')}
            >
              <Users className="w-3.5 h-3.5" />
              Все участники
            </Button>
            <Button
              variant={accessType === 'roles' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setAccessType('roles')}
            >
              <UserCheck className="w-3.5 h-3.5" />
              По ролям
            </Button>
          </div>
          {accessType === 'roles' && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {PROJECT_ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs border transition-colors',
                    selectedRoles.has(r.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border',
                  )}
                  onClick={() => toggleRole(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email: адрес получателя (chips) */}
        {isEmail && (
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">Email получателя</Label>
            <EmailRecipientInput
              chips={enrichedEmails}
              inputValue={emailInput}
              dropdownOpen={emailDropdownOpen}
              suggestions={filteredEmailSuggestions}
              onInputChange={setEmailInput}
              onDropdownOpenChange={setEmailDropdownOpen}
              onAddChip={addChip}
              onRemoveChip={removeChip}
              onRemoveLast={removeLast}
            />
          </div>
        )}

        {/* Email: тема */}
        {isEmail && (
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">
              Тема письма
              <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
                {'({project_name}, {date})'}
              </span>
            </Label>
            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Запрос документов: {project_name}"
            />
          </div>
        )}

        {/* Шаблон первого сообщения */}
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">
            Шаблон первого сообщения
            <span className="text-muted-foreground/60 ml-1 font-normal text-xs">(HTML)</span>
          </Label>
          <Textarea
            value={initialMessageHtml}
            onChange={(e) => setInitialMessageHtml(e.target.value)}
            placeholder={
              isEmail ? 'Здравствуйте!\n\nПросим предоставить...' : 'Текст первого сообщения...'
            }
            rows={3}
            className="resize-y text-sm"
          />
        </div>
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
