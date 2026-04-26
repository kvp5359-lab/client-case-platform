/**
 * Константы для отображения разрешений
 */

import {
  Settings,
  FileText,
  FolderOpen,
  CheckSquare,
  History,
  Sparkles,
  MessageSquare,
  MessagesSquare,
  BookOpen,
  NotebookText,
} from 'lucide-react'
import type { WorkspacePermissions, ProjectModuleAccess } from '@/types/permissions'

export const WORKSPACE_PERMISSION_LABELS: Record<
  keyof WorkspacePermissions,
  { label: string; description: string }
> = {
  manage_workspace_settings: {
    label: 'Настройки workspace',
    description: 'Редактировать название, описание',
  },
  delete_workspace: { label: 'Удаление workspace', description: '⚠️ Только для владельца' },
  manage_participants: {
    label: 'Управление участниками',
    description: 'Добавлять, удалять участников',
  },
  manage_roles: { label: 'Управление ролями', description: 'Создавать и редактировать роли' },
  manage_templates: {
    label: 'Управление шаблонами',
    description: 'Шаблоны проектов, анкет, документов',
  },
  manage_statuses: { label: 'Управление статусами', description: 'Статусы для всех сущностей' },
  manage_features: {
    label: 'Управление возможностями',
    description: 'Включать/выключать AI и интеграции',
  },
  create_projects: { label: 'Создание проектов', description: 'Создавать новые проекты' },
  view_all_projects: {
    label: 'Просмотр всех проектов',
    description: 'Видеть все проекты workspace',
  },
  edit_all_projects: {
    label: 'Редактирование всех проектов',
    description: 'Редактировать любой проект',
  },
  delete_all_projects: { label: 'Удаление всех проектов', description: 'Удалять любой проект' },
  view_knowledge_base: {
    label: 'Просмотр базы знаний',
    description: 'Просматривать статьи базы знаний',
  },
  manage_knowledge_base: {
    label: 'Управление базой знаний',
    description: 'Создавать, редактировать и удалять статьи',
  },
  view_workspace_digest: {
    label: 'Дневник проекта',
    description: 'Видеть общую страницу «Дневник» и собирать сводки по всем проектам',
  },
}

// Используем Partial, так как finance опционально
export const MODULE_LABELS: Partial<
  Record<keyof ProjectModuleAccess, { label: string; icon: typeof Settings }>
> = {
  settings: { label: 'Настройки', icon: Settings },
  forms: { label: 'Анкеты', icon: FileText },
  documents: { label: 'Документы', icon: FolderOpen },
  tasks: { label: 'Задачи', icon: CheckSquare },
  chats: { label: 'Чаты', icon: MessagesSquare },
  history: { label: 'История', icon: History },
  knowledge_base: { label: 'Материалы', icon: BookOpen },
  ai_document_check: { label: 'AI проверка документов', icon: Sparkles },
  ai_form_autofill: { label: 'AI автозаполнение', icon: Sparkles },
  ai_knowledge_all: { label: 'AI: Вся база знаний', icon: Sparkles },
  ai_knowledge_project: { label: 'AI: База знаний проекта', icon: Sparkles },
  ai_project_assistant: { label: 'AI: Ассистент по проекту', icon: Sparkles },
  comments: { label: 'Комментарии', icon: MessageSquare },
  digest: { label: 'Дневник', icon: NotebookText },
}
