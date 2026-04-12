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
 * Шаблоны, видимые внутри проекта: глобальные + привязанные к типу этого
 * проекта. Если projectTemplateId === null — эквивалент useGlobalThreadTemplates.
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
      let query = supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('workspace_id', workspaceId)
      query = projectTemplateId
        ? query.or(
            `owner_project_template_id.is.null,owner_project_template_id.eq.${projectTemplateId}`,
          )
        : query.is('owner_project_template_id', null)
      const { data, error } = await query
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
 * Только шаблоны, привязанные к конкретному типу проекта. Для редактора
 * типа проекта в настройках workspace (модули "Задачи" и "Чаты").
 */
export function useThreadTemplatesByProjectTemplate(
  projectTemplateId: string | undefined,
) {
  return useQuery<ThreadTemplate[]>({
    queryKey: threadTemplateKeys.byProjectTemplate(projectTemplateId ?? ''),
    queryFn: async () => {
      if (!projectTemplateId) return []
      const { data, error } = await supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('owner_project_template_id', projectTemplateId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ThreadTemplate[]
    },
    enabled: !!projectTemplateId,
    staleTime: STALE_TIME.STANDARD,
  })
}

// ── Placeholder replacement ──

interface PlaceholderContext {
  projectName?: string
}

export function replacePlaceholders(text: string, ctx: PlaceholderContext): string {
  let result = text
  result = result.replace(/\{project_name\}/g, ctx.projectName ?? '')
  result = result.replace(/\{date\}/g, new Date().toLocaleDateString('ru-RU'))
  return result
}

// ── Apply template ──

interface ApplyTemplateContext {
  projectName?: string
  /** Участники текущего проекта (id → { name, last_name }) */
  projectParticipantIds: Set<string>
  /** Все участники workspace (для отображения имён в toast) */
  allParticipants: { id: string; name: string; last_name: string | null }[]
  /** Текущие статусы задач workspace */
  taskStatusIds: Set<string>
}

export interface AppliedTemplate {
  tabMode: 'task' | 'chat' | 'email'
  name: string
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

  // Status — проверяем что существует
  const taskStatusId =
    template.default_status_id && ctx.taskStatusIds.has(template.default_status_id)
      ? template.default_status_id
      : null

  // Deadline
  const taskDeadline =
    template.deadline_days != null ? addDays(new Date(), template.deadline_days) : undefined

  // Assignees — фильтруем по участникам проекта
  const templateAssigneeIds = (template.thread_template_assignees ?? []).map(
    (a) => a.participant_id,
  )
  const foundIds: string[] = []
  const missingAssignees: string[] = []

  for (const pid of templateAssigneeIds) {
    if (ctx.projectParticipantIds.has(pid)) {
      foundIds.push(pid)
    } else {
      const p = ctx.allParticipants.find((pp) => pp.id === pid)
      if (p) {
        missingAssignees.push(`${p.name}${p.last_name ? ' ' + p.last_name : ''}`)
      }
    }
  }

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

  // Initial message
  const initialMessageHtml = template.initial_message_html
    ? replacePlaceholders(template.initial_message_html, placeholderCtx)
    : null

  return {
    tabMode,
    name,
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
