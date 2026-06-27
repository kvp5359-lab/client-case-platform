'use client'

/**
 * Общий блок полей «параметры задачи/треда».
 *
 * ЕДИНЫЙ источник набора и порядка полей. Используется в:
 *   - ThreadTemplateDialog (редактор шаблона треда)
 *   - RecurringRuleDialog (вкладка «Параметры задачи» окна повторения)
 *
 * Добавил/переставил поле здесь — изменилось в ОБОИХ местах автоматически.
 * Различия (имя шаблона, дедлайн-N-дней, автопереход статуса, email-поля,
 * переключатель Задача/Чат/Email) гейтятся флагами — лишнее не лезет туда,
 * где не нужно.
 */

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Users, UserCheck } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconColorPicker } from './IconColorPicker'
import { StatusPicker } from './StatusPicker'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import { EmailRecipientInput, type EmailChip } from './EmailRecipientInput'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { Tables } from '@/types/database'

type StatusRow = Tables<'statuses'>

export const PROJECT_ROLE_OPTIONS = [
  { value: 'Администратор', label: 'Администраторы' },
  { value: 'Исполнитель', label: 'Исполнители' },
  { value: 'Клиент', label: 'Клиенты' },
  { value: 'Участник', label: 'Наблюдатели' },
] as const

export type ThreadTemplateEmailProps = {
  chips: EmailChip[]
  inputValue: string
  dropdownOpen: boolean
  suggestions: EmailChip[]
  onInputChange: (v: string) => void
  onDropdownOpenChange: (v: boolean) => void
  onAddChip: (chip: EmailChip) => void
  onRemoveChip: (email: string) => void
  onRemoveLast: () => void
  subject: string
  onSubjectChange: (v: string) => void
}

export type ThreadTemplateFieldsProps = {
  workspaceId: string
  isTask: boolean
  isEmail: boolean

  // Имя шаблона (только в редакторе шаблона)
  showTemplateName?: boolean
  templateName?: string
  onTemplateNameChange?: (v: string) => void

  description: string
  onDescriptionChange: (v: string) => void

  // Название треда/задачи + статус + иконка
  threadNameLabel?: string
  threadNamePlaceholder?: string
  threadNameTemplate: string
  onThreadNameChange: (v: string) => void
  taskStatuses: StatusRow[]
  statusId: string | null
  onStatusChange: (id: string) => void
  accentColor: ThreadAccentColor
  onAccentColorChange: (c: ThreadAccentColor) => void
  icon: string
  onIconChange: (i: string) => void

  // Дедлайн «N дней» (только в редакторе шаблона)
  showDeadlineDays?: boolean
  deadlineDays?: string
  onDeadlineDaysChange?: (v: string) => void

  // Автопереход статуса проекта при завершении (только в редакторе шаблона)
  showOnComplete?: boolean
  projectStatuses?: StatusRow[]
  onCompleteStatusId?: string | null
  onOnCompleteStatusChange?: (id: string | null) => void

  // Исполнители (задачи)
  participants: WorkspaceParticipant[]
  assigneeIds: Set<string>
  onToggleAssignee: (id: string) => void

  // Доступ
  accessType: 'all' | 'roles'
  onAccessTypeChange: (t: 'all' | 'roles') => void
  selectedRoles: Set<string>
  onToggleRole: (role: string) => void

  // Email (только в email-режиме)
  email?: ThreadTemplateEmailProps

  initialMessageHtml: string
  onInitialMessageChange: (v: string) => void
}

export function ThreadTemplateFields(props: ThreadTemplateFieldsProps) {
  const {
    workspaceId,
    isTask,
    isEmail,
    showTemplateName,
    templateName = '',
    onTemplateNameChange,
    description,
    onDescriptionChange,
    threadNameLabel = 'Название треда',
    threadNamePlaceholder,
    threadNameTemplate,
    onThreadNameChange,
    taskStatuses,
    statusId,
    onStatusChange,
    accentColor,
    onAccentColorChange,
    icon,
    onIconChange,
    showDeadlineDays,
    deadlineDays = '',
    onDeadlineDaysChange,
    showOnComplete,
    projectStatuses = [],
    onCompleteStatusId,
    onOnCompleteStatusChange,
    participants,
    assigneeIds,
    onToggleAssignee,
    accessType,
    onAccessTypeChange,
    selectedRoles,
    onToggleRole,
    email,
    initialMessageHtml,
    onInitialMessageChange,
  } = props

  const [iconColorOpen, setIconColorOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {showTemplateName && (
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Название шаблона *</Label>
          <Input
            value={templateName}
            onChange={(e) => onTemplateNameChange?.(e.target.value)}
            placeholder="Например: Запрос документов"
            autoFocus
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">Описание</Label>
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Краткое описание"
        />
      </div>

      {showTemplateName && <hr className="border-dashed" />}

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <Label className="text-sm text-muted-foreground">
            {threadNameLabel}
            <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
              {'({project_name}, {date})'}
            </span>
          </Label>
          <Input
            value={threadNameTemplate}
            onChange={(e) => onThreadNameChange(e.target.value)}
            placeholder={
              threadNamePlaceholder ??
              (isTask
                ? 'Проверка анкеты: {project_name}'
                : isEmail
                  ? 'Запрос: {project_name}'
                  : 'Обсуждение: {project_name}')
            }
          />
        </div>

        {isTask && (
          <StatusPicker
            open={statusOpen}
            onOpenChange={setStatusOpen}
            statuses={taskStatuses}
            statusId={statusId}
            onStatusChange={onStatusChange}
          />
        )}

        <IconColorPicker
          open={iconColorOpen}
          onOpenChange={setIconColorOpen}
          accentColor={accentColor}
          icon={icon}
          onColorChange={onAccentColorChange}
          onIconChange={onIconChange}
        />
      </div>

      {isTask && showDeadlineDays && (
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Дедлайн</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              className="w-24"
              value={deadlineDays}
              onChange={(e) => onDeadlineDaysChange?.(e.target.value)}
              placeholder="—"
            />
            <span className="text-sm text-muted-foreground">дней после создания</span>
          </div>
        </div>
      )}

      {isTask && showOnComplete && (
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">
            При завершении перевести проект в статус
          </Label>
          <Select
            value={onCompleteStatusId ?? '__none__'}
            onValueChange={(v) => onOnCompleteStatusChange?.(v === '__none__' ? null : v)}
            disabled={projectStatuses.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Не менять" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Не менять</SelectItem>
              {projectStatuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isTask && (
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">Исполнители</Label>
          <AssigneesPopover
            mode="controlled"
            workspaceId={workspaceId}
            assigneeIds={assigneeIds}
            onToggle={onToggleAssignee}
            participantsOverride={participants}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">Доступ</Label>
        <div className="flex gap-2">
          <Button
            variant={accessType === 'all' ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => onAccessTypeChange('all')}
          >
            <Users className="w-3.5 h-3.5" />
            Все участники
          </Button>
          <Button
            variant={accessType === 'roles' ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => onAccessTypeChange('roles')}
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
                onClick={() => onToggleRole(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isEmail && email && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">Email получателя</Label>
            <EmailRecipientInput
              chips={email.chips}
              inputValue={email.inputValue}
              dropdownOpen={email.dropdownOpen}
              suggestions={email.suggestions}
              onInputChange={email.onInputChange}
              onDropdownOpenChange={email.onDropdownOpenChange}
              onAddChip={email.onAddChip}
              onRemoveChip={email.onRemoveChip}
              onRemoveLast={email.onRemoveLast}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-sm text-muted-foreground">
              Тема письма
              <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
                {'({project_name}, {date})'}
              </span>
            </Label>
            <Input
              value={email.subject}
              onChange={(e) => email.onSubjectChange(e.target.value)}
              placeholder="Запрос документов: {project_name}"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">
          Шаблон первого сообщения
          <span className="text-muted-foreground/60 ml-1 font-normal text-xs">(HTML)</span>
        </Label>
        <Textarea
          value={initialMessageHtml}
          onChange={(e) => onInitialMessageChange(e.target.value)}
          placeholder={
            isEmail ? 'Здравствуйте!\n\nПросим предоставить...' : 'Текст первого сообщения...'
          }
          rows={3}
          className="resize-y text-sm"
        />
      </div>
    </div>
  )
}
