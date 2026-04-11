/**
 * Система прав доступа Docu-Flow
 * Типы и интерфейсы для работы с разрешениями
 */

// =====================================================
// Разрешения Workspace (уровень компании)
// =====================================================

/**
 * Все возможные разрешения на уровне workspace
 */
export type WorkspacePermission =
  | 'manage_workspace_settings' // Редактировать настройки workspace
  | 'delete_workspace' // Удалить workspace (только Владелец)
  | 'manage_participants' // Управлять участниками
  | 'manage_roles' // Управлять ролями
  | 'manage_templates' // Управлять шаблонами
  | 'manage_statuses' // Управлять статусами
  | 'manage_features' // Управлять возможностями
  | 'create_projects' // Создавать проекты
  | 'view_all_projects' // Видеть все проекты
  | 'edit_all_projects' // Редактировать все проекты
  | 'delete_all_projects' // Удалять все проекты
  | 'view_knowledge_base' // Просматривать базу знаний
  | 'manage_knowledge_base' // Создавать, редактировать, удалять статьи

/**
 * Объект разрешений workspace
 */
export interface WorkspacePermissions {
  manage_workspace_settings: boolean
  delete_workspace: boolean
  manage_participants: boolean
  manage_roles: boolean
  manage_templates: boolean
  manage_statuses: boolean
  manage_features: boolean
  create_projects: boolean
  view_all_projects: boolean
  edit_all_projects: boolean
  delete_all_projects: boolean
  view_knowledge_base: boolean
  manage_knowledge_base: boolean
}

// =====================================================
// Модули проекта
// =====================================================

/**
 * Объект доступа к модулям
 *
 * `threads` — единый модуль, объединяющий задачи, клиентский чат и
 * командный чат проекта. Он заменил три прежних флага (`tasks`,
 * `messenger`, `internal_messenger`) с 2026-04-11, так как эти три
 * раздела всегда конфигурировались вместе и в UI теперь живут в одном
 * блоке "Задачи и чаты".
 */
export interface ProjectModuleAccess {
  settings: boolean
  forms: boolean
  documents: boolean
  threads: boolean
  history: boolean
  card_view: boolean
  ai_document_check: boolean
  ai_form_autofill: boolean
  ai_knowledge_all: boolean
  ai_knowledge_project: boolean
  ai_project_assistant: boolean
  comments: boolean
  knowledge_base: boolean
  // Будущие модули — optional т.к. не все workspace имеют эти модули включенными
  finance?: boolean
}

/**
 * Все модули проекта (вкладки и возможности).
 * Производный от ключей ProjectModuleAccess — гарантирует синхронность типов.
 */
export type ProjectModule = keyof ProjectModuleAccess

// =====================================================
// Разрешения внутри модулей проекта
// =====================================================

/**
 * Разрешения модуля Settings
 */
export interface SettingsPermissions {
  edit_project_info: boolean // Редактировать информацию
  manage_project_participants: boolean // Управлять участниками
  manage_google_drive: boolean // Настройка Google Drive
  delete_project: boolean // Удалить проект
}

/**
 * Разрешения модуля Forms
 */
export interface FormsPermissions {
  add_forms: boolean // Добавлять анкеты
  fill_forms: boolean // Заполнять анкеты
  edit_own_form_answers: boolean // Редактировать свои ответы
  view_others_form_answers: boolean // Видеть ответы других
}

/**
 * Разрешения модуля Documents
 */
export interface DocumentsPermissions {
  add_documents: boolean // Добавлять документы
  view_documents: boolean // Просматривать документы
  edit_documents: boolean // Редактировать документы
  download_documents: boolean // Скачивать документы
  move_documents: boolean // Перемещать документы
  delete_documents: boolean // Удалять документы
  compress_pdf: boolean // Сжимать PDF
  view_document_technical_info: boolean // Техническая информация
  create_folders: boolean // Создавать секции
  add_document_kits: boolean // Добавлять наборы
}

/**
 * Разрешения модуля Comments
 */
export interface CommentsPermissions {
  view_comments: boolean // Просматривать комментарии
  edit_comments: boolean // Создавать и редактировать свои
  manage_comments: boolean // Удалять чужие, полное управление
}

/**
 * Все разрешения внутри модулей проекта
 */
export interface ProjectPermissions {
  settings: SettingsPermissions
  forms: FormsPermissions
  documents: DocumentsPermissions
  comments: CommentsPermissions
}

/**
 * Коды разрешений модуля Settings
 */
export type SettingsPermissionCode = keyof SettingsPermissions

/**
 * Коды разрешений модуля Forms
 */
export type FormsPermissionCode = keyof FormsPermissions

/**
 * Коды разрешений модуля Documents
 */
export type DocumentsPermissionCode = keyof DocumentsPermissions

/**
 * Коды разрешений модуля Comments
 */
export type CommentsPermissionCode = keyof CommentsPermissions

/**
 * Все коды разрешений проекта
 */
export type ProjectPermissionCode =
  | SettingsPermissionCode
  | FormsPermissionCode
  | DocumentsPermissionCode
  | CommentsPermissionCode

// =====================================================
// Возможности Workspace (Features)
// =====================================================

/**
 * Все возможности workspace
 */
export type WorkspaceFeature =
  | 'ai_document_check' // AI проверка документов
  | 'ai_form_autofill' // AI автозаполнение анкет
  | 'ai_chat_assistant' // AI чат-ассистент
  | 'google_drive_integration' // Google Drive
  | 'comments' // Комментарии
  | 'email_notifications' // Email уведомления
  | 'analytics' // Аналитика
  | 'finance_module' // Финансы
  | 'ai_knowledge_search' // AI-поиск по базе знаний

/**
 * Объект возможностей workspace
 */
export interface WorkspaceFeatures {
  ai_document_check: boolean
  ai_form_autofill: boolean
  ai_chat_assistant: boolean
  google_drive_integration: boolean
  comments: boolean
  email_notifications: boolean
  analytics: boolean
  finance_module: boolean
  ai_knowledge_search: boolean
}

// =====================================================
// Роли
// =====================================================

/**
 * Роль workspace
 */
export interface WorkspaceRole {
  id: string
  workspace_id: string
  name: string
  description: string | null
  color: string
  is_system: boolean
  is_owner: boolean
  order_index: number
  permissions: WorkspacePermissions
  created_at: string
  updated_at: string
}

/**
 * Роль проекта
 */
export interface ProjectRole {
  id: string
  workspace_id: string
  name: string
  description: string | null
  color: string
  is_system: boolean
  order_index: number
  module_access: ProjectModuleAccess
  permissions: ProjectPermissions
  created_at: string
  updated_at: string
}

// =====================================================
// Системные роли (константы)
// =====================================================

/**
 * Названия системных ролей workspace
 */
export const SYSTEM_WORKSPACE_ROLES = {
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  EMPLOYEE: 'Сотрудник',
  CLIENT: 'Клиент',
} as const

/**
 * Названия системных ролей проекта
 */
export const SYSTEM_PROJECT_ROLES = {
  ADMIN: 'Администратор',
  EXECUTOR: 'Исполнитель',
  CLIENT: 'Клиент',
  PARTICIPANT: 'Участник',
} as const

// =====================================================
// Вспомогательные типы
// =====================================================
