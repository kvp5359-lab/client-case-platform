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

import { createElement, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Users, UserCheck, CircleDashed, Calendar, Mail } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { safeCssColor } from '@/utils/isValidCssColor'
import { getStatusIcon } from '@/components/common/status-icons'
import { acc } from '@/lib/accentPalette'
import { IconColorPicker } from './IconColorPicker'
import { StatusPicker } from './StatusPicker'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import { ChatSettingsStatusPopover } from '@/components/messenger/ChatSettingsStatusPopover'
import { ChatSettingsIconColorPicker } from '@/components/messenger/ChatSettingsIconColorPicker'
import { EmailRecipientInput, type EmailChip } from './EmailRecipientInput'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import type { Tables } from '@/types/database'

type StatusRow = Tables<'statuses'>

/** Форма проекта для селектора «проект по умолчанию» (совпадает с useWorkspaceProjects). */
export type ThreadTemplateProjectOption = {
  id: string
  name: string
  description: string | null
  template_id: string | null
  status_id: string | null
  project_templates: { name: string } | null
}

export const PROJECT_ROLE_OPTIONS = [
  { value: 'Администратор', label: 'Администраторы' },
  { value: 'Исполнитель', label: 'Исполнители' },
  { value: 'Клиент', label: 'Клиенты' },
  { value: 'Участник', label: 'Наблюдатели' },
] as const

/** Управление одним переопределяемым полем в контексте типа проекта. */
export type FieldOverrideCtl = { active: boolean; onToggle: (next: boolean) => void }

/**
 * Управление пер-проектными переопределениями (задаётся только редактором
 * шаблона проекта). undefined = обычный редактор общего шаблона (без пометок
 * «из общего / индивидуально»).
 */
export type ThreadTemplateProjectOverrideCtl = {
  deadline: FieldOverrideCtl
  message: FieldOverrideCtl
  access: FieldOverrideCtl
  assignees: FieldOverrideCtl
}

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

  /**
   * Стиль как в форме задачи: название/описание/статус/иконка в единой рамке.
   * Включается только в редакторе шаблона треда (в «Повторяющихся» — старый вид).
   */
  taskStyleThreadBlock?: boolean

  // Описание по умолчанию треда (только в редакторе шаблона, при taskStyleThreadBlock)
  defaultDescription?: string
  onDefaultDescriptionChange?: (v: string) => void

  // Проект по умолчанию (только в редакторе шаблона треда)
  showDefaultProject?: boolean
  workspaceProjects?: ThreadTemplateProjectOption[]
  defaultProjectId?: string | null
  onDefaultProjectChange?: (id: string | null) => void

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

  /** Пер-проектные переопределения (только редактор шаблона проекта). */
  projectOverride?: ThreadTemplateProjectOverrideCtl
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
    taskStyleThreadBlock,
    defaultDescription = '',
    onDefaultDescriptionChange,
    showDefaultProject,
    workspaceProjects = [],
    defaultProjectId = null,
    onDefaultProjectChange,
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
    projectOverride,
  } = props

  const [iconColorOpen, setIconColorOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  // Заголовок переопределяемого поля (в редакторе шаблона проекта): показывает
  // «из общего / индивидуально» и переключает наследование.
  const overrideHeader = (label: string, ctl: FieldOverrideCtl) => (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {ctl.active ? (
        <button
          type="button"
          onClick={() => ctl.onToggle(false)}
          className="text-xs text-amber-600 hover:text-amber-700 whitespace-nowrap"
          title="Вернуть значение из общего шаблона"
        >
          Индивидуально · сбросить
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ctl.onToggle(true)}
          className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
          title="Задать своё значение для этого типа проекта"
        >
          Из общего · переопределить
        </button>
      )}
    </div>
  )

  const currentStatus = taskStatuses.find((s) => s.id === statusId)
  // Дедлайн шаблона — «через N дней после создания». Чип выглядит как «Срок»
  // задачи, но внутри — поле числа дней (дата тут не имеет смысла: шаблон
  // многоразовый, срок отсчитывается от даты создания треда).
  const hasDeadline = deadlineDays.trim() !== '' && !isNaN(Number(deadlineDays))

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
            className="text-[15px] font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-sm text-muted-foreground">
          {showTemplateName ? 'Описание шаблона' : 'Описание'}
        </Label>
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={showTemplateName ? 'Для чего этот шаблон (видно в списке)' : 'Краткое описание'}
        />
      </div>

      {showTemplateName && <hr className="border-dashed" />}

      {taskStyleThreadBlock ? (
        /* Стиль как в форме задачи: единая рамка «Название треда + Описание»,
           статус-точка слева и иконка справа внутри строки названия. */
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">
            {threadNameLabel}
            <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
              {'({project_name}, {date})'}
            </span>
          </Label>
          <div className="rounded-md border border-input bg-background overflow-hidden transition-shadow focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.10)]">
            <div className="flex items-center">
              <ChatSettingsStatusPopover
                taskStatuses={taskStatuses}
                currentStatusId={statusId}
                currentStatus={currentStatus}
                statusPopoverOpen={statusOpen}
                onOpenChange={setStatusOpen}
                onSelect={onStatusChange}
              />
              <input
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
                className="flex-1 min-w-0 h-9 pl-2 pr-2 py-1 text-[15px] font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40 placeholder:font-normal"
              />
              <ChatSettingsIconColorPicker
                accentColor={accentColor}
                icon={icon}
                onAccentColorChange={onAccentColorChange}
                onIconChange={onIconChange}
              />
            </div>
            <div className="h-px bg-border mx-2" />
            <textarea
              value={defaultDescription}
              onChange={(e) => onDefaultDescriptionChange?.(e.target.value)}
              placeholder="Описание — внутренняя заметка команды, клиент не видит…"
              rows={2}
              className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground/40 max-h-64 overflow-y-auto"
            />
          </div>
        </div>
      ) : (
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
              className="text-[15px] font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
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
      )}

      {/* Стиль задачи: дедлайн (датой) + статус + проект чипами одной строкой. */}
      {taskStyleThreadBlock && (
        <div className="flex items-center gap-2 flex-wrap -mt-1">
          {showDeadlineDays && !projectOverride && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors shrink-0 whitespace-nowrap',
                    hasDeadline
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                  title="Дедлайн: через N дней после создания"
                >
                  <Calendar className="w-3 h-3 shrink-0" />
                  {hasDeadline ? `Через ${Number(deadlineDays)} дн.` : 'Срок'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-3">
                <Label className="text-xs text-muted-foreground">Дедлайн</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    type="number"
                    min={0}
                    className="w-20 h-8"
                    value={deadlineDays}
                    onChange={(e) => onDeadlineDaysChange?.(e.target.value)}
                    placeholder="—"
                    autoFocus
                  />
                  <span className="text-sm text-muted-foreground">дней после создания</span>
                </div>
                {hasDeadline && (
                  <button
                    type="button"
                    onClick={() => onDeadlineDaysChange?.('')}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Очистить
                  </button>
                )}
              </PopoverContent>
            </Popover>
          )}

          {taskStatuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={
                    currentStatus
                      ? 'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0 hover:brightness-95'
                      : 'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0 bg-muted/60 text-muted-foreground hover:bg-muted'
                  }
                  style={
                    currentStatus
                      ? {
                          backgroundColor: `color-mix(in srgb, ${safeCssColor(currentStatus.color)} 14%, transparent)`,
                          color: `color-mix(in srgb, ${safeCssColor(currentStatus.color)} 82%, black)`,
                        }
                      : undefined
                  }
                >
                  {currentStatus ? (
                    <>
                      {currentStatus.icon ? (
                        createElement(getStatusIcon(currentStatus.icon), {
                          className: 'w-3.5 h-3.5 shrink-0',
                        })
                      ) : (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: safeCssColor(currentStatus.color) }}
                        />
                      )}
                      <span className="truncate max-w-[140px]">{currentStatus.name}</span>
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
                {taskStatuses.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onStatusChange(s.id)} className="gap-2">
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

          {showDefaultProject && (
            <ChatSettingsProjectSelector
              workspaceProjects={workspaceProjects}
              selectedProjectId={defaultProjectId}
              isEditMode={false}
              onSelect={(id) => onDefaultProjectChange?.(id)}
              workspaceId={workspaceId}
              variant="muted"
              label="Выбрать проект"
            />
          )}
        </div>
      )}

      {showDefaultProject && !taskStyleThreadBlock && (
        <div className="flex flex-col gap-1">
          <Label className="text-sm text-muted-foreground">
            Проект по умолчанию
            <span className="text-muted-foreground/60 ml-1 font-normal text-xs">
              (тред сразу создаётся в нём)
            </span>
          </Label>
          <div>
            <ChatSettingsProjectSelector
              workspaceProjects={workspaceProjects}
              selectedProjectId={defaultProjectId}
              isEditMode={false}
              onSelect={(id) => onDefaultProjectChange?.(id)}
              workspaceId={workspaceId}
              variant="muted"
              label="Без проекта (выбирать при создании)"
            />
          </div>
        </div>
      )}

      {/* Выделенный блок дедлайна в редакторе шаблона проекта — с пометкой
          «из общего / индивидуально». */}
      {(isTask || isEmail) && showDeadlineDays && projectOverride && (
        <div className="flex flex-col gap-1">
          {overrideHeader('Дедлайн', projectOverride.deadline)}
          <div
            className={cn(
              'flex items-center gap-2',
              !projectOverride.deadline.active && 'opacity-50 pointer-events-none',
            )}
          >
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

      {(isTask || isEmail) && showDeadlineDays && !taskStyleThreadBlock && !projectOverride && (
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

      {/* Исполнители — одинаково для всех типов треда (задача/чат/email):
          назначение даёт доступ к треду и работает для любого типа. */}
      {(
        <div className="flex flex-col gap-1">
          {projectOverride ? (
            overrideHeader('Исполнители', projectOverride.assignees)
          ) : (
            <Label className="text-sm text-muted-foreground">Исполнители</Label>
          )}
          <div
            className={cn(
              projectOverride &&
                !projectOverride.assignees.active &&
                'opacity-50 pointer-events-none',
            )}
          >
            <AssigneesPopover
              mode="controlled"
              workspaceId={workspaceId}
              assigneeIds={assigneeIds}
              onToggle={onToggleAssignee}
              participantsOverride={participants}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {projectOverride ? (
          overrideHeader('Доступ', projectOverride.access)
        ) : (
          <Label className="text-sm text-muted-foreground">Доступ</Label>
        )}
        <div
          className={cn(
            'flex flex-col gap-1',
            projectOverride && !projectOverride.access.active && 'opacity-50 pointer-events-none',
          )}
        >
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
      </div>

      {/* Email-поля + первое сообщение. В task-стиле — единый блок «Письмо»/«Первое
          сообщение» на светло-акцентном фоне (как в форме задачи). Иначе (окно
          «Повторяющиеся») — прежний плоский вид. */}
      {taskStyleThreadBlock ? (
        isEmail && email ? (
          <div className={cn('rounded-md p-3 space-y-3', acc.bgSoft(accentColor))}>
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-muted-foreground" /> Письмо
            </Label>
            <EmailRecipientInput
              prefix="Кому:"
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
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background text-sm focus-within:ring-1 focus-within:ring-ring">
              <span className="text-muted-foreground/70 shrink-0 select-none">Тема:</span>
              <input
                value={email.subject}
                onChange={(e) => email.onSubjectChange(e.target.value)}
                placeholder="Запрос документов: {project_name}"
                className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              {projectOverride ? (
                overrideHeader('Текст письма', projectOverride.message)
              ) : (
                <Label className="text-xs text-muted-foreground">Текст письма</Label>
              )}
              <Textarea
                value={initialMessageHtml}
                onChange={(e) => onInitialMessageChange(e.target.value)}
                placeholder="Здравствуйте!&#10;&#10;Просим предоставить..."
                rows={3}
                className={cn(
                  'resize-y text-sm bg-background',
                  projectOverride && !projectOverride.message.active && 'opacity-50 pointer-events-none',
                )}
              />
            </div>
          </div>
        ) : (
          <div className={cn('rounded-md p-3 space-y-1', acc.bgSoft(accentColor))}>
            {projectOverride ? (
              overrideHeader('Первое сообщение', projectOverride.message)
            ) : (
              <Label className="text-sm font-medium">Первое сообщение</Label>
            )}
            <Textarea
              value={initialMessageHtml}
              onChange={(e) => onInitialMessageChange(e.target.value)}
              placeholder="Текст первого сообщения..."
              rows={3}
              className={cn(
                'resize-y text-sm bg-background',
                projectOverride && !projectOverride.message.active && 'opacity-50 pointer-events-none',
              )}
            />
          </div>
        )
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
