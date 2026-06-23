/**
 * Типы и константы для ChatSettingsDialog и его подкомпонентов.
 */

import { MessageSquare, Send, Mail } from 'lucide-react'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'

// ── Types ──

export type AccessType = 'all' | 'roles' | 'custom'
export type ChannelType = 'none' | 'telegram' | 'email'
export type ThreadType = 'chat' | 'task'
export type TabMode = 'task' | 'chat' | 'email'

export type ChatSettingsResult = {
  threadType: ThreadType
  name: string
  accessType: AccessType
  accentColor: ThreadAccentColor
  icon: string
  channelType: ChannelType
  contactEmails?: Array<{ email: string; label: string }>
  emailSubject?: string
  memberIds?: string[]
  accessRoles?: string[]
  // Task-specific
  /** Срок задачи. Для задач с интервалом времени совпадает с endAt
   *  (БД-триггер sync_thread_deadline_end_at следит за равенством). */
  deadline?: string | null
  /** Запланированное начало. NULL = задача без слота в календаре. */
  startAt?: string | null
  /** Запланированный конец. Триггер БД синхронизирует deadline = endAt. */
  endAt?: string | null
  statusId?: string | null
  assigneeIds?: string[]
  // Project
  projectId?: string | null
  // First message (optional)
  initialMessage?: { html: string; files: File[] }
  /**
   * true — тред создаётся как черновик: первое сообщение НЕ отправляется,
   * а текст/файлы перекладываются в композер открытого треда. Получатели и
   * тема email уже сохранены в треде. Кнопка «Сохранить черновик» (email).
   */
  asDraft?: boolean
  /**
   * ID шаблона, из которого заполнена форма. Прокидывается в create-mutation,
   * чтобы в новом треде проставить source_template_id.
   */
  sourceTemplateId?: string | null
}

export type ChatCreatePreset = {
  tabMode?: TabMode
  projectId?: string
  statusId?: string
  deadline?: string
  /** Запланированное начало (ISO). Если передано вместе с endAt — форма
   *  открывается с включённой длительностью и временем из slot. */
  startAt?: string
  endAt?: string
  assigneeIds?: string[]
}

export type ChatSettingsDialogProps = {
  /** null = create mode, ProjectThread = edit mode */
  chat: ProjectThread | null
  projectId?: string
  workspaceId?: string
  /** Default thread type when creating (default: 'chat') */
  defaultThreadType?: ThreadType
  /** Default tab mode including email (overrides defaultThreadType for tab selection) */
  defaultTabMode?: 'task' | 'chat' | 'email'
  /** Auto-apply template when dialog opens */
  initialTemplate?: ThreadTemplate | null
  /**
   * Preset значений для формы в create-режиме. Применяется один раз при open.
   * Используется для предзаполнения из фильтра колонки доски / списка.
   */
  initialValues?: ChatCreatePreset
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate?: (result: ChatSettingsResult) => void
  onUpdate?: (params: {
    name: string
    accent_color: ThreadAccentColor
    icon: string
    type?: string
  }) => void
  isPending?: boolean
}

export type Participant = {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
  user_id?: string | null
  workspace_roles?: string[] | null
  project_roles?: string[]
  is_deleted?: boolean
  email?: string | null
  can_login?: boolean
}

// ── Constants ──

export const CHANNEL_OPTIONS: {
  value: ChannelType
  label: string
  desc: string
  icon: typeof MessageSquare
}[] = [
  { value: 'none', label: 'Без подключения', desc: 'Внутренний чат', icon: MessageSquare },
  { value: 'telegram', label: 'Telegram', desc: 'Группа в Telegram', icon: Send },
  { value: 'email', label: 'Email', desc: 'Через Gmail', icon: Mail },
]

// «Staff» в контексте классификации участников чата = ТОЛЬКО workspace-роли.
// Отличается от глобального STAFF_ROLES из permissions.ts (туда входит project-роль
// «Исполнитель»). Здесь специально без неё — getRoleGroup ниже различает workspace
// и project уровни через 4 группы: staff (workspace) / external / client / other.
export const STAFF_ROLES = [
  SYSTEM_WORKSPACE_ROLES.OWNER,
  SYSTEM_WORKSPACE_ROLES.ADMIN,
  SYSTEM_WORKSPACE_ROLES.EMPLOYEE,
]
export const EXTERNAL_ROLES = ['Внешний сотрудник']
export const CLIENT_ROLES = [SYSTEM_WORKSPACE_ROLES.CLIENT]

export const PROJECT_ROLE_OPTIONS = [
  { value: 'Администратор', label: 'Администраторы' },
  { value: 'Исполнитель', label: 'Исполнители' },
  { value: 'Клиент', label: 'Клиенты' },
  { value: 'Участник', label: 'Наблюдатели' },
] as const

// ── Utilities ──

export function getRoleGroup(roles?: string[] | null): 'staff' | 'external' | 'client' | 'other' {
  if (!roles) return 'other'
  // .includes на readonly tuple-типе требует приведения параметра к union;
  // вместо этого приводим сам массив к string[] — семантика та же.
  const staff: readonly string[] = STAFF_ROLES
  const external: readonly string[] = EXTERNAL_ROLES
  const client: readonly string[] = CLIENT_ROLES
  if (roles.some((r) => staff.includes(r))) return 'staff'
  if (roles.some((r) => external.includes(r))) return 'external'
  if (roles.some((r) => client.includes(r))) return 'client'
  return 'other'
}
