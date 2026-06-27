'use client'

import { useMemo, useState } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DatePicker } from '@/components/ui/date-picker'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useTaskStatuses } from '@/hooks/useStatuses'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { useCreateRecurringRule, useUpdateRecurringRule } from '@/hooks/useRecurringRules'
import { ThreadTemplateFields } from '@/components/templates/ThreadTemplateFields'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import { TimeOfDayPopover as TimeOfDayField } from './TimeOfDayPopover'
import {
  describeSchedule,
  nextOccurrences,
  WEEKDAYS,
  type RecurrenceFreq,
  type RecurrenceSchedule,
} from '@/lib/recurring/schedule'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { RecurringRule } from '@/types/recurring'

export type RecurringRulePrefill = {
  title?: string
  projectId?: string | null
  projectName?: string | null
  statusId?: string | null
  accentColor?: string
  icon?: string
  assigneeIds?: string[]
  accessType?: string
  accessRoles?: string[] | null
  sourceTemplateId?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  rule?: RecurringRule | null
  prefill?: RecurringRulePrefill
}

function toYmd(d: Date | undefined): string | null {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromYmd(s: string | null | undefined): Date | undefined {
  if (!s) return undefined
  const [y, mo, d] = s.split('-').map((x) => parseInt(x, 10))
  if (!y || !mo || !d) return undefined
  return new Date(y, mo - 1, d)
}

function addMinutesToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
  const total = (((h || 0) * 60 + (m || 0) + mins) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function RecurringRuleDialog({ open, onClose, workspaceId, rule, prefill }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        {open && (
          <RecurringRuleForm
            key={rule ? rule.id : 'new'}
            workspaceId={workspaceId}
            rule={rule}
            prefill={prefill}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecurringRuleForm({
  workspaceId,
  rule,
  prefill,
  onClose,
}: {
  workspaceId: string
  rule?: RecurringRule | null
  prefill?: RecurringRulePrefill
  onClose: () => void
}) {
  const { user } = useAuth()
  const create = useCreateRecurringRule()
  const update = useUpdateRecurringRule()
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const { data: taskStatuses = [] } = useTaskStatuses(workspaceId)
  const { data: projects = [] } = useWorkspaceProjects(workspaceId)

  const isEdit = !!rule

  // ── Параметры задачи (общий компонент) ──
  const [title, setTitle] = useState(rule?.title ?? prefill?.title ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [accentColor, setAccentColor] = useState<ThreadAccentColor>(
    (rule ? rule.accent_color : prefill?.accentColor ?? 'blue') as ThreadAccentColor,
  )
  const [icon, setIcon] = useState(rule ? rule.icon : prefill?.icon ?? 'message-square')
  const [statusId, setStatusId] = useState<string | null>(
    rule ? rule.status_id : prefill?.statusId ?? null,
  )
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(
    new Set(rule ? rule.assignee_participant_ids ?? [] : prefill?.assigneeIds ?? []),
  )
  const initAccess = (rule ? rule.access_type : prefill?.accessType ?? 'all') === 'roles'
    ? 'roles'
    : 'all'
  const [accessType, setAccessType] = useState<'all' | 'roles'>(initAccess)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(rule ? rule.access_roles ?? [] : prefill?.accessRoles ?? []),
  )
  const [initialMessageHtml, setInitialMessageHtml] = useState(rule?.initial_message_html ?? '')

  // ── Настройка повторения ──
  const [projectId, setProjectId] = useState<string | null>(
    rule ? rule.project_id : prefill?.projectId ?? null,
  )
  const [freq, setFreq] = useState<RecurrenceFreq>(rule?.freq ?? 'weekly')
  const [weekdays, setWeekdays] = useState<string[]>(
    rule ? (rule.byweekday ?? []).map(String) : ['1'],
  )
  const [monthday, setMonthday] = useState<string>(
    rule ? (rule.bymonthday === -1 ? 'last' : String(rule.bymonthday ?? 1)) : '1',
  )
  const [fireTime, setFireTime] = useState((rule?.fire_time ?? '09:00').slice(0, 5))
  const [hasDuration, setHasDuration] = useState(rule ? rule.end_time != null : false)
  const [endTime, setEndTime] = useState(
    (rule?.end_time ?? addMinutesToHHMM(rule?.fire_time?.slice(0, 5) ?? '09:00', 30)).slice(0, 5),
  )
  const handleToggleDuration = (v: boolean) => {
    setHasDuration(v)
    if (v) setEndTime(addMinutesToHHMM(fireTime, 30))
  }
  const initLead = rule?.create_lead_minutes ?? 0
  const [leadDays, setLeadDays] = useState(String(Math.floor(initLead / 1440)))
  const [leadHours, setLeadHours] = useState(String(Math.floor((initLead % 1440) / 60)))
  const [startsOn, setStartsOn] = useState<Date | undefined>(fromYmd(rule?.starts_on))
  const [untilDate, setUntilDate] = useState<Date | undefined>(fromYmd(rule?.until_date))

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleRole = (role: string) =>
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })

  const schedule: RecurrenceSchedule = useMemo(
    () => ({
      freq,
      byweekday: weekdays.map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 7),
      bymonthday: monthday === 'last' ? -1 : parseInt(monthday, 10),
      fireTime,
      startsOn: toYmd(startsOn),
      untilDate: toYmd(untilDate),
    }),
    [freq, weekdays, monthday, fireTime, startsOn, untilDate],
  )
  const preview = useMemo(() => nextOccurrences(schedule, new Date(), 3), [schedule])

  const scheduleValid = freq !== 'weekly' || schedule.byweekday.length > 0
  const canSubmit =
    title.trim().length > 0 && scheduleValid && !create.isPending && !update.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const common = {
      title: title.trim(),
      description: description || null,
      status_id: statusId,
      accent_color: accentColor,
      icon,
      access_type: accessType,
      access_roles: accessType === 'roles' ? [...selectedRoles] : [],
      assignee_participant_ids: [...assigneeIds],
      initial_message_html: initialMessageHtml || null,
      freq,
      byweekday: freq === 'weekly' ? schedule.byweekday : [],
      bymonthday: freq === 'monthly' ? schedule.bymonthday : null,
      fire_time: fireTime,
      end_time: hasDuration ? endTime : null,
      create_lead_minutes:
        Math.max(0, parseInt(leadDays, 10) || 0) * 1440 +
        Math.max(0, parseInt(leadHours, 10) || 0) * 60,
      starts_on: toYmd(startsOn),
      until_date: toYmd(untilDate),
    }

    if (isEdit && rule) {
      update.mutate({ id: rule.id, workspace_id: workspaceId, ...common }, { onSuccess: onClose })
    } else {
      create.mutate(
        {
          workspace_id: workspaceId,
          project_id: projectId,
          owner_user_id: projectId ? null : user?.id ?? null,
          ...common,
        },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Повторяющаяся задача' : 'Сделать повторяющейся'}</DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="params" className="py-2">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="params">Параметры задачи</TabsTrigger>
          <TabsTrigger value="recurrence">Настройка повторения</TabsTrigger>
        </TabsList>

        {/* Вкладка 1 — общий блок полей (тот же, что в редакторе шаблона) */}
        <TabsContent value="params" className="mt-4">
          <ThreadTemplateFields
            workspaceId={workspaceId}
            isTask
            isEmail={false}
            description={description}
            onDescriptionChange={setDescription}
            threadNameLabel="Название задачи"
            threadNamePlaceholder="Например: Еженедельный отчёт {date}"
            threadNameTemplate={title}
            onThreadNameChange={setTitle}
            taskStatuses={taskStatuses}
            statusId={statusId}
            onStatusChange={setStatusId}
            accentColor={accentColor}
            onAccentColorChange={setAccentColor}
            icon={icon}
            onIconChange={setIcon}
            participants={participants}
            assigneeIds={assigneeIds}
            onToggleAssignee={toggleAssignee}
            accessType={accessType}
            onAccessTypeChange={setAccessType}
            selectedRoles={selectedRoles}
            onToggleRole={toggleRole}
            initialMessageHtml={initialMessageHtml}
            onInitialMessageChange={setInitialMessageHtml}
          />
        </TabsContent>

        {/* Вкладка 2 — расписание */}
        <TabsContent value="recurrence" className="mt-4 flex flex-col gap-5">
          {/* Проект — тот же пикер, что в настройках треда */}
          <div className="space-y-2">
            <Label>Проект</Label>
            <ChatSettingsProjectSelector
              workspaceProjects={projects}
              selectedProjectId={projectId}
              isEditMode
              onSelect={setProjectId}
              workspaceId={workspaceId}
              createDefaultName={title}
              variant="muted"
              label="Без проекта (личная задача)"
              iconClassName="w-3.5 h-3.5"
              triggerClassName="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-accent/50 transition-colors"
            />
          </div>

          {/* Периодичность + зависимое поле */}
          <div className="grid grid-cols-[160px_1fr] gap-4">
            <div className="space-y-2">
              <Label>Периодичность</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as RecurrenceFreq)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Ежедневно</SelectItem>
                  <SelectItem value="weekly">По дням недели</SelectItem>
                  <SelectItem value="monthly">Ежемесячно</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {freq === 'weekly' && (
              <div className="space-y-2">
                <Label>Дни недели</Label>
                <ToggleGroup
                  type="multiple"
                  value={weekdays}
                  onValueChange={(v) => setWeekdays(v)}
                  variant="outline"
                  className="justify-start flex-nowrap gap-0.5"
                >
                  {WEEKDAYS.map((w) => (
                    <ToggleGroupItem
                      key={w.iso}
                      value={String(w.iso)}
                      className="h-8 w-8 min-w-0 shrink-0 px-0 text-xs"
                    >
                      {w.short}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}

            {freq === 'monthly' && (
              <div className="space-y-2">
                <Label>Число месяца</Label>
                <Select value={monthday} onValueChange={setMonthday}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}-го числа
                      </SelectItem>
                    ))}
                    <SelectItem value="last">Последний день месяца</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {freq === 'weekly' && !scheduleValid && (
            <p className="text-xs text-destructive">Выберите хотя бы один день недели.</p>
          )}

          {/* Время задачи + Создавать заранее — в одну строку */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* Время задачи + длительность */}
            <div className="space-y-2">
              <Label>Время задачи</Label>
              <div className="flex items-center gap-2">
                <TimeOfDayField value={fireTime} onChange={setFireTime} ariaLabel="Время задачи" />
                {hasDuration && (
                  <>
                    <span className="text-sm text-muted-foreground">–</span>
                    <TimeOfDayField
                      value={endTime}
                      onChange={setEndTime}
                      ariaLabel="Конец интервала"
                    />
                  </>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Switch checked={hasDuration} onCheckedChange={handleToggleDuration} />
                Указать длительность
              </label>
            </div>

            {/* Создавать заранее */}
            <div className="space-y-2">
              <Label>Создавать заранее</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  className="w-14"
                  aria-label="Создавать заранее, дней"
                />
                <span className="text-xs text-muted-foreground">дн</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={leadHours}
                  onChange={(e) => setLeadHours(e.target.value)}
                  className="w-14"
                  aria-label="Создавать заранее, часов"
                />
                <span className="text-xs text-muted-foreground">ч</span>
              </div>
              <p className="text-xs text-muted-foreground">до времени задачи</p>
            </div>
          </div>

          {/* Пределы */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Начать с</Label>
              <DatePicker date={startsOn} onDateChange={setStartsOn} placeholder="не задано" />
            </div>
            <div className="space-y-2">
              <Label>Повторять до</Label>
              <DatePicker date={untilDate} onDateChange={setUntilDate} placeholder="бессрочно" />
            </div>
          </div>

          {/* Превью */}
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="font-medium">{describeSchedule(schedule)}</div>
            {preview.length > 0 ? (
              <div className="mt-1 text-xs text-muted-foreground">
                Ближайшие создания:{' '}
                {preview
                  .map((d) =>
                    d.toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  )
                  .join(' · ')}
              </div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">Нет ближайших дат.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {create.isPending || update.isPending
            ? 'Сохранение…'
            : isEdit
              ? 'Сохранить'
              : 'Создать повторение'}
        </Button>
      </DialogFooter>
    </form>
  )
}
