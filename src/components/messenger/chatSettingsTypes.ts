/**
 * Типы и константы для ChatSettingsDialog и его подкомпонентов.
 */

import { MessageSquare, Send, Mail } from 'lucide-react'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'

// ── Types ──

export type AccessType = 'all' | 'roles' | 'custom'
export type ChannelType = 'none' | 'telegram' | 'email'
export type ThreadType = 'chat' | 'task'
export type TabMode = 'task' | 'chat' | 'email'

export interface ChatSettingsResult {
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
  deadline?: string | null
  statusId?: string | null
  assigneeIds?: string[]
  // Project
  projectId?: string | null
  // First message (optional)
  initialMessage?: { html: string; files: File[] }
}

export interface ChatSettingsDialogProps {
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

export interface Participant {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
  user_id?: string | null
  workspace_roles?: string[]
  project_roles?: string[]
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

export const STAFF_ROLES = ['Владелец', 'Администратор', 'Сотрудник']
export const EXTERNAL_ROLES = ['Внешний сотрудник']
export const CLIENT_ROLES = ['Клиент']

export const PROJECT_ROLE_OPTIONS = [
  { value: 'Администратор', label: 'Администраторы' },
  { value: 'Исполнитель', label: 'Исполнители' },
  { value: 'Клиент', label: 'Клиенты' },
  { value: 'Участник', label: 'Наблюдатели' },
] as const

// ── Utilities ──

export function getRoleGroup(roles?: string[]): 'staff' | 'external' | 'client' | 'other' {
  if (!roles) return 'other'
  if (roles.some((r) => STAFF_ROLES.includes(r))) return 'staff'
  if (roles.some((r) => EXTERNAL_ROLES.includes(r))) return 'external'
  if (roles.some((r) => CLIENT_ROLES.includes(r))) return 'client'
  return 'other'
}
