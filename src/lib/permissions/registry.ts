/**
 * Единый реестр прав доступа — источник правды для UI и дефолтов.
 *
 * Здесь описаны:
 *  - права роли Workspace (группы: компания, проекты, база знаний, разделы,
 *    действия с задачами, действия с чатами);
 *  - модули проектной роли (тумблеры видимости вкладок);
 *  - действия внутри модулей проекта (настройки/анкеты/документы/комментарии).
 *
 * Чтобы добавить право — добавь строку в соответствующий массив. UI и
 * пустые заготовки прав собираются из этих массивов автоматически.
 */

import {
  Settings,
  FileText,
  FolderOpen,
  MessageSquare,
  MessagesSquare,
  CheckSquare,
  History,
  Sparkles,
  BookOpen,
  NotebookText,
  DollarSign,
  Compass,
  ListChecks,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import type {
  WorkspacePermission,
  WorkspacePermissions,
  ProjectModuleAccess,
} from '@/types/permissions'

// =====================================================
// Роль Workspace
// =====================================================

export type WorkspacePermGroupId =
  | 'company'
  | 'projects'
  | 'kb'
  | 'sections'
  | 'task_actions'
  | 'chat_actions'

export type WorkspacePermDef = {
  key: WorkspacePermission
  group: WorkspacePermGroupId
  label: string
  description?: string
  /** Опасное/спорное действие — подсвечивается в UI. */
  danger?: boolean
  /** Право доступно только владельцу (нельзя включить другим ролям). */
  ownerOnly?: boolean
}

export const WORKSPACE_PERM_GROUPS: { id: WorkspacePermGroupId; label: string }[] = [
  { id: 'company', label: 'Управление компанией' },
  { id: 'projects', label: 'Проекты' },
  { id: 'kb', label: 'База знаний · дневник' },
  { id: 'sections', label: 'Доступ к разделам' },
  { id: 'task_actions', label: 'Действия с задачами' },
  { id: 'chat_actions', label: 'Действия с чатами' },
]

export const WORKSPACE_PERMISSION_DEFS: WorkspacePermDef[] = [
  // --- Управление компанией ---
  { key: 'manage_workspace_settings', group: 'company', label: 'Настройки workspace', description: 'Редактировать название, описание' },
  { key: 'delete_workspace', group: 'company', label: 'Удаление workspace', description: 'Только для владельца', danger: true, ownerOnly: true },
  { key: 'manage_participants', group: 'company', label: 'Управление участниками', description: 'Добавлять, удалять участников' },
  { key: 'manage_roles', group: 'company', label: 'Управление ролями', description: 'Создавать и редактировать роли' },
  { key: 'manage_templates', group: 'company', label: 'Управление шаблонами', description: 'Шаблоны проектов, анкет, документов' },
  { key: 'manage_statuses', group: 'company', label: 'Управление статусами', description: 'Статусы для всех сущностей' },
  { key: 'manage_features', group: 'company', label: 'Управление возможностями', description: 'Включать/выключать AI и интеграции' },

  // --- Проекты ---
  { key: 'create_projects', group: 'projects', label: 'Создание проектов', description: 'Создавать новые проекты' },
  { key: 'view_all_projects', group: 'projects', label: 'Просмотр всех проектов', description: 'Видеть все проекты workspace' },
  { key: 'edit_all_projects', group: 'projects', label: 'Редактирование всех проектов', description: 'Редактировать любой проект' },
  { key: 'delete_all_projects', group: 'projects', label: 'Удаление всех проектов', description: 'Удалять любой проект', danger: true },

  // --- База знаний · дневник ---
  { key: 'view_knowledge_base', group: 'kb', label: 'Просмотр базы знаний', description: 'Просматривать статьи базы знаний' },
  { key: 'manage_knowledge_base', group: 'kb', label: 'Управление базой знаний', description: 'Создавать, редактировать и удалять статьи' },
  { key: 'view_workspace_digest', group: 'kb', label: 'Дневник', description: 'Страница «Дневник» и сводки по проектам' },

  // --- Доступ к разделам (NEW) ---
  { key: 'view_inbox', group: 'sections', label: 'Входящие', description: 'Раздел «Входящие»' },
  { key: 'view_tasks_page', group: 'sections', label: 'Задачи (страница)', description: 'Общая страница задач' },
  { key: 'view_calendar', group: 'sections', label: 'Календарь', description: 'Раздел «Календарь»' },
  { key: 'view_boards', group: 'sections', label: 'Доски и списки', description: 'Раздел «Доски и списки»' },
  { key: 'view_reports', group: 'sections', label: 'Отчёты', description: 'Раздел «Отчёты»' },
  { key: 'view_source_updates', group: 'sections', label: 'Обновления источников', description: 'Раздел «Обновления источников»' },
  { key: 'view_finance', group: 'sections', label: 'Финансы', description: 'Раздел «Финансы»' },

  // --- Действия с задачами (NEW) ---
  { key: 'create_tasks', group: 'task_actions', label: 'Создавать задачи' },
  { key: 'edit_any_task', group: 'task_actions', label: 'Редактировать любую задачу', description: 'Чужие задачи тоже', danger: true },
  { key: 'change_task_status', group: 'task_actions', label: 'Менять статус' },
  { key: 'manage_task_assignees', group: 'task_actions', label: 'Назначать исполнителей' },
  { key: 'delete_own_task', group: 'task_actions', label: 'Удалять свою задачу', danger: true },
  { key: 'delete_any_task', group: 'task_actions', label: 'Удалять любую задачу', danger: true },

  // --- Действия с чатами (NEW) ---
  { key: 'edit_own_message', group: 'chat_actions', label: 'Редактировать своё сообщение' },
  { key: 'forward_messages', group: 'chat_actions', label: 'Пересылать' },
  { key: 'react_messages', group: 'chat_actions', label: 'Реагировать' },
  { key: 'delete_own_message', group: 'chat_actions', label: 'Удалять своё сообщение', danger: true },
  { key: 'delete_any_message', group: 'chat_actions', label: 'Удалять любое сообщение', danger: true },
]

/** Все ключи прав роли Workspace (порядок реестра). */
export const WORKSPACE_PERMISSION_KEYS: WorkspacePermission[] = WORKSPACE_PERMISSION_DEFS.map(
  (d) => d.key,
)

/** Пустой объект прав (все false) — заготовка для мёрджа по ИЛИ. */
export function emptyWorkspacePermissions(): WorkspacePermissions {
  const out = {} as WorkspacePermissions
  for (const key of WORKSPACE_PERMISSION_KEYS) {
    out[key] = false
  }
  return out
}

// =====================================================
// Роль Проекта — модули (видимость вкладок)
// =====================================================

export type ProjectModuleDef = {
  key: keyof ProjectModuleAccess
  label: string
  icon: LucideIcon
}

/** Порядок и подписи тумблеров модулей проектной роли. */
export const PROJECT_MODULE_DEFS: ProjectModuleDef[] = [
  { key: 'tasks', label: 'Задачи', icon: CheckSquare },
  { key: 'chats', label: 'Чаты', icon: MessagesSquare },
  { key: 'documents', label: 'Документы', icon: FolderOpen },
  { key: 'forms', label: 'Анкеты', icon: FileText },
  { key: 'plan', label: 'План', icon: ListChecks },
  { key: 'visa_selection', label: 'Подбор ВНЖ', icon: Compass },
  { key: 'knowledge_base', label: 'Материалы', icon: BookOpen },
  { key: 'history', label: 'История', icon: History },
  { key: 'digest', label: 'Дневник', icon: NotebookText },
  { key: 'project_context', label: 'Заметки', icon: Lock },
  { key: 'finance', label: 'Финансы', icon: DollarSign },
  { key: 'settings', label: 'Настройки', icon: Settings },
  { key: 'comments', label: 'Комментарии', icon: MessageSquare },
  { key: 'ai_document_check', label: 'AI: проверка документов', icon: Sparkles },
  { key: 'ai_form_autofill', label: 'AI: автозаполнение', icon: Sparkles },
  { key: 'ai_knowledge_all', label: 'AI: вся база знаний', icon: Sparkles },
  { key: 'ai_knowledge_project', label: 'AI: база знаний проекта', icon: Sparkles },
  { key: 'ai_project_assistant', label: 'AI: ассистент по проекту', icon: Sparkles },
]

// =====================================================
// Роль Проекта — действия внутри модулей
// =====================================================

export type ProjectActionModule = 'settings' | 'forms' | 'documents' | 'comments'

export type ProjectActionDef = { key: string; label: string; danger?: boolean }

export type ProjectActionGroup = {
  module: ProjectActionModule
  label: string
  icon: LucideIcon
  actions: ProjectActionDef[]
}

export const PROJECT_ACTION_GROUPS: ProjectActionGroup[] = [
  {
    module: 'settings',
    label: 'Настройки',
    icon: Settings,
    actions: [
      { key: 'edit_project_info', label: 'Редактировать информацию' },
      { key: 'manage_project_participants', label: 'Управлять участниками' },
      { key: 'manage_google_drive', label: 'Настройка Google Drive' },
      { key: 'delete_project', label: 'Удалить проект', danger: true },
    ],
  },
  {
    module: 'forms',
    label: 'Анкеты',
    icon: FileText,
    actions: [
      { key: 'add_forms', label: 'Добавлять анкеты' },
      { key: 'fill_forms', label: 'Заполнять анкеты' },
      { key: 'edit_own_form_answers', label: 'Редактировать свои ответы' },
      { key: 'view_others_form_answers', label: 'Видеть ответы других' },
    ],
  },
  {
    module: 'documents',
    label: 'Документы',
    icon: FolderOpen,
    actions: [
      { key: 'add_documents', label: 'Добавлять документы' },
      { key: 'view_documents', label: 'Просматривать документы' },
      { key: 'edit_documents', label: 'Редактировать документы' },
      { key: 'download_documents', label: 'Скачивать документы' },
      { key: 'move_documents', label: 'Перемещать документы' },
      { key: 'delete_documents', label: 'Удалять документы', danger: true },
      { key: 'compress_pdf', label: 'Сжимать PDF' },
      { key: 'view_document_technical_info', label: 'Техническая информация' },
      { key: 'create_folders', label: 'Создавать секции' },
      { key: 'add_document_kits', label: 'Добавлять наборы' },
    ],
  },
  {
    module: 'comments',
    label: 'Комментарии',
    icon: MessageSquare,
    actions: [
      { key: 'view_comments', label: 'Просматривать комментарии' },
      { key: 'edit_comments', label: 'Создавать и редактировать свои' },
      { key: 'manage_comments', label: 'Удалять чужие, полное управление', danger: true },
    ],
  },
]
