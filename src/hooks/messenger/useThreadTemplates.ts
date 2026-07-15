"use client"

/**
 * Хуки и утилиты для шаблонов тредов.
 *
 * useThreadTemplates — загрузка списка шаблонов workspace.
 * applyTemplate — маппинг шаблона → форма ChatSettingsDialog.
 * replacePlaceholders — подстановка {project_name}, {date}.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { threadTemplateKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { addDays } from 'date-fns'

// ── Query ──

/**
 * Все шаблоны тредов workspace, включая привязанные к типам проекта.
 * Не использовать в меню "+" — засоряет список. Для меню бери
 * useThreadTemplatesForProject (внутри проекта) или useGlobalThreadTemplates
 * (вне контекста проекта).
 */
export function useThreadTemplates(workspaceId: string | undefined) {
  return useQuery<ThreadTemplate[]>({
    queryKey: threadTemplateKeys.byWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ThreadTemplate[]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/**
 * Только глобальные шаблоны workspace (owner_project_template_id IS NULL).
 * Используется в разделе "Шаблоны тредов" настроек workspace и в меню "+"
 * за пределами контекста проекта.
 */
export function useGlobalThreadTemplates(workspaceId: string | undefined) {
  return useQuery<ThreadTemplate[]>({
    queryKey: threadTemplateKeys.globalByWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('workspace_id', workspaceId)
        .is('owner_project_template_id', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ThreadTemplate[]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/**
 * Разворачивает строку junction project_template_thread_templates в форму
 * ThreadTemplate: тело берётся из связанного глобального thread_templates,
 * а пер-проектные поля (sort_order/default_status_id/on_complete...) — из
 * самой junction-строки. Так все потребители работают с привычной формой.
 */
type JunctionRow = {
  id: string
  sort_order: number
  default_status_id: string | null
  on_complete_set_project_status_id: string | null
  // Пер-проектные override-поля (null скаляр = наследовать из общего шаблона).
  deadline_days: number | null
  initial_message_html: string | null
  access_type: 'all' | 'roles' | null
  access_roles: string[] | null
  /** Источник правды об исполнителях привязки (см. ThreadTemplateProjectOverride).
   *  'extend' задаётся только у привязок каналов — в проектном редакторе такого
   *  режима нет, поэтому для формы он читается как «наследовать». */
  assignees_mode: 'inherit' | 'override' | 'extend'
  thread_templates: ThreadTemplate | null
}

function mapJunctionRow(
  r: JunctionRow,
  overrideAssigneeIds: string[],
): ThreadTemplate | null {
  if (!r.thread_templates) return null
  return {
    // База — «рыба» общего шаблона (в т.ч. общие deadline/access/message/
    // исполнители остаются как есть, эффективное значение считает потребитель).
    ...r.thread_templates,
    sort_order: r.sort_order,
    default_status_id: r.default_status_id,
    on_complete_set_project_status_id: r.on_complete_set_project_status_id,
    projectOverride: {
      bindingId: r.id,
      deadline_days: r.deadline_days,
      initial_message_html: r.initial_message_html,
      access_type: r.access_type,
      access_roles: r.access_roles,
      assignees_overridden: r.assignees_mode === 'override',
      override_assignee_ids: overrideAssigneeIds,
    },
  }
}

const JUNCTION_SELECT =
  'id, sort_order, default_status_id, on_complete_set_project_status_id, deadline_days, initial_message_html, access_type, access_roles, assignees_mode, thread_templates(*, thread_template_assignees(participant_id))'

/**
 * Override-исполнители типа проекта (project_template_thread_assignees) —
 * отдельным запросом (составной FK не встраиваем через PostgREST). Карта
 * thread_template_id → participant_id[].
 */
async function fetchOverrideAssigneeMap(
  projectTemplateId: string,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('project_template_thread_assignees')
    .select('thread_template_id, participant_id')
    .eq('template_id', projectTemplateId)
  if (error) throw error
  const map = new Map<string, string[]>()
  for (const row of (data ?? []) as { thread_template_id: string; participant_id: string }[]) {
    const arr = map.get(row.thread_template_id) ?? []
    arr.push(row.participant_id)
    map.set(row.thread_template_id, arr)
  }
  return map
}

/**
 * Шаблоны, видимые внутри проекта: привязанные к типу этого проекта (через
 * junction) + «отдельные» глобальные, не привязанные ни к одному типу. Если
 * projectTemplateId === null — вся библиотека (как было: глобальные везде).
 */
export function useThreadTemplatesForProject(
  workspaceId: string | undefined,
  projectTemplateId: string | null | undefined,
) {
  return useQuery<ThreadTemplate[]>({
    queryKey: threadTemplateKeys.forProjectContext(
      workspaceId ?? '',
      projectTemplateId ?? null,
    ),
    queryFn: async () => {
      if (!workspaceId) return []

      // Все глобальные шаблоны воркспейса (вся библиотека).
      const { data: globals, error: gErr } = await supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('workspace_id', workspaceId)
        .is('owner_project_template_id', null)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (gErr) throw gErr
      const allGlobals = (globals ?? []) as ThreadTemplate[]

      // Без контекста типа проекта — показываем всю библиотеку.
      if (!projectTemplateId) return allGlobals

      // Этапы этого типа проекта (с пер-проектными настройками из junction).
      const { data: jrows, error: jErr } = await supabase
        .from('project_template_thread_templates')
        .select(JUNCTION_SELECT)
        .eq('template_id', projectTemplateId)
        .order('sort_order', { ascending: true })
      if (jErr) throw jErr
      const overrideMap = await fetchOverrideAssigneeMap(projectTemplateId)
      const scoped = ((jrows ?? []) as unknown as JunctionRow[])
        .map((r) => mapJunctionRow(r, overrideMap.get(r.thread_templates?.id ?? '') ?? []))
        .filter((t): t is ThreadTemplate => t !== null)
      const scopedIds = new Set(scoped.map((t) => t.id))

      // «Отдельные» глобальные — не привязанные НИ к одному типу проекта.
      const { data: attached } = await supabase
        .from('project_template_thread_templates')
        .select('thread_template_id, thread_templates!inner(workspace_id)')
        .eq('thread_templates.workspace_id', workspaceId)
      const attachedIds = new Set(
        ((attached ?? []) as { thread_template_id: string }[]).map((r) => r.thread_template_id),
      )
      const standalone = allGlobals.filter(
        (g) => !attachedIds.has(g.id) && !scopedIds.has(g.id),
      )

      return [...scoped, ...standalone]
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
  })
}

/**
 * Только этапы, привязанные к конкретному типу проекта (через junction). Для
 * редактора типа проекта в настройках workspace (модули "Задачи" и "Чаты").
 * Пер-проектные sort_order/default_status_id/on_complete... — из junction.
 */
export function useThreadTemplatesByProjectTemplate(
  projectTemplateId: string | undefined,
) {
  return useQuery<ThreadTemplate[]>({
    queryKey: threadTemplateKeys.byProjectTemplate(projectTemplateId ?? ''),
    queryFn: async () => {
      if (!projectTemplateId) return []
      const { data, error } = await supabase
        .from('project_template_thread_templates')
        .select(JUNCTION_SELECT)
        .eq('template_id', projectTemplateId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      const overrideMap = await fetchOverrideAssigneeMap(projectTemplateId)
      return ((data ?? []) as unknown as JunctionRow[])
        .map((r) => mapJunctionRow(r, overrideMap.get(r.thread_templates?.id ?? '') ?? []))
        .filter((t): t is ThreadTemplate => t !== null)
    },
    enabled: !!projectTemplateId,
    staleTime: STALE_TIME.STANDARD,
  })
}

// ── Placeholder replacement ──

type PlaceholderContext = {
  projectName?: string
}

export function replacePlaceholders(text: string, ctx: PlaceholderContext): string {
  let result = text
  result = result.replace(/\{project_name\}/g, ctx.projectName ?? '')
  result = result.replace(/\{date\}/g, new Date().toLocaleDateString('ru-RU'))
  return result
}

// ── Apply template ──

type ApplyTemplateContext = {
  projectName?: string
  /** Участники текущего проекта (id → { name, last_name }) */
  projectParticipantIds: Set<string>
  /** Все участники workspace (для отображения имён в toast) */
  allParticipants: { id: string; name: string; last_name: string | null }[]
  /** Текущие статусы задач workspace */
  taskStatusIds: Set<string>
}

export type AppliedTemplate = {
  tabMode: 'task' | 'chat' | 'email'
  name: string
  /** Описание по умолчанию для треда (project_threads.description). */
  description: string
  accentColor: ThreadAccentColor
  icon: string
  accessType: 'all' | 'roles'
  accessRoles: string[]
  taskStatusId: string | null
  taskDeadline: Date | undefined
  taskAssigneeIds: string[]
  channelType: 'none' | 'email'
  contactEmails: string[]
  emailSubject: string
  initialMessageHtml: string | null
  /** Имена участников, которых не нашли в проекте */
  missingAssignees: string[]
}

export function applyTemplate(
  template: ThreadTemplate,
  ctx: ApplyTemplateContext,
): AppliedTemplate {
  const placeholderCtx: PlaceholderContext = { projectName: ctx.projectName }

  // Tab mode
  let tabMode: 'task' | 'chat' | 'email' = template.thread_type === 'task' ? 'task' : 'chat'
  if (template.is_email) tabMode = 'email'

  // Name
  const name = template.thread_name_template
    ? replacePlaceholders(template.thread_name_template, placeholderCtx)
    : ''

  // Default description (внутренняя заметка треда)
  const description = template.default_description
    ? replacePlaceholders(template.default_description, placeholderCtx)
    : ''

  // Status — проверяем что существует
  const taskStatusId =
    template.default_status_id && ctx.taskStatusIds.has(template.default_status_id)
      ? template.default_status_id
      : null

  // Deadline
  const taskDeadline =
    template.deadline_days != null ? addDays(new Date(), template.deadline_days) : undefined

  // Assignees — применяем ВСЕХ исполнителей шаблона безусловно. Раньше отсеивали
  // тех, кого нет в участниках проекта (owner/сотрудник вне проекта терялся) —
  // но назначение и так даёт доступ к задаче без доступа к проекту. Плюс это
  // убирает гонку: applyTemplate срабатывает при открытии, до загрузки участников
  // проекта — фильтр по ним ронял исполнителей. Список участников используется
  // только чтобы отобразить чип в форме (см. assigneeParticipants), не для отбора.
  const foundIds: string[] = (template.thread_template_assignees ?? []).map(
    (a) => a.participant_id,
  )
  const missingAssignees: string[] = []

  // Channel type
  const channelType = template.is_email ? 'email' : ('none' as const)

  // Contact emails (comma-separated in DB)
  const contactEmails = (template.default_contact_email ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  // Email subject
  const emailSubject = template.email_subject_template
    ? replacePlaceholders(template.email_subject_template, placeholderCtx)
    : ''

  // Initial message. Поле хранит plain text с \n (вводится в <Textarea>),
  // но может содержать и HTML. Если HTML-тегов нет — конвертируем \n в <br>,
  // иначе Tiptap.setContent(html) проигнорирует переносы строк.
  const rawInitial = template.initial_message_html
    ? replacePlaceholders(template.initial_message_html, placeholderCtx)
    : null
  const initialMessageHtml = rawInitial
    ? /<\/?[a-z][\s\S]*?>/i.test(rawInitial)
      ? rawInitial
      : rawInitial
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r?\n/g, '<br>')
    : null

  return {
    tabMode,
    name,
    description,
    accentColor: template.accent_color as ThreadAccentColor,
    icon: template.icon,
    accessType: template.access_type,
    accessRoles: template.access_roles ?? [],
    taskStatusId,
    taskDeadline,
    taskAssigneeIds: foundIds,
    channelType,
    contactEmails,
    emailSubject,
    initialMessageHtml,
    missingAssignees,
  }
}
