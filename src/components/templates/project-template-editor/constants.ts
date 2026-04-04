/**
 * Константы и типы для ProjectTemplateEditorPage
 */

import {
  FileText,
  FolderOpen,
  DollarSign,
  CheckSquare,
  MessageSquare,
  BookOpen,
} from 'lucide-react'
import type { Database } from '@/types/database'

// Доступные модули для проекта
export const AVAILABLE_MODULES = [
  {
    id: 'forms',
    label: 'Анкеты',
    icon: FileText,
    description: 'Модуль для создания и управления анкетами',
  },
  {
    id: 'documents',
    label: 'Документы',
    icon: FolderOpen,
    description: 'Модуль для работы с наборами документов',
  },
  {
    id: 'finances',
    label: 'Финансы',
    icon: DollarSign,
    description: 'Модуль для учёта финансов проекта',
  },
  {
    id: 'tasks',
    label: 'Задачи',
    icon: CheckSquare,
    description: 'Модуль для управления задачами проекта',
  },
  {
    id: 'ai_chat',
    label: 'AI-ассистент',
    icon: MessageSquare,
    description: 'Общение с нейросетью по документам проекта',
  },
  {
    id: 'knowledge_base',
    label: 'База знаний',
    icon: BookOpen,
    description: 'Полезные материалы для клиентов',
  },
  {
    id: 'messenger',
    label: 'Мессенджер',
    icon: MessageSquare,
    description: 'Чат проекта с интеграцией Telegram',
  },
  {
    id: 'internal_messenger',
    label: 'Командный чат',
    icon: MessageSquare,
    description: 'Внутренний чат для сотрудников (клиенты не видят)',
  },
] as const

// Типы из базы данных
export type ProjectTemplate = Database['public']['Tables']['project_templates']['Row']
export type FormTemplate = Database['public']['Tables']['form_templates']['Row']
export type DocumentKitTemplate = Database['public']['Tables']['document_kit_templates']['Row']
export type ProjectTemplateForm = Database['public']['Tables']['project_template_forms']['Row']
export type ProjectTemplateDocumentKit =
  Database['public']['Tables']['project_template_document_kits']['Row']

// Шаблон анкеты с данными
export interface FormTemplateWithRelation extends ProjectTemplateForm {
  form_template: FormTemplate
}

// Шаблон набора документов с данными
export interface DocumentKitTemplateWithRelation extends ProjectTemplateDocumentKit {
  document_kit_template: DocumentKitTemplate
}

// Типы для базы знаний
export type KnowledgeArticle = Database['public']['Tables']['knowledge_articles']['Row']
export type KnowledgeGroup = Database['public']['Tables']['knowledge_groups']['Row']
export type KnowledgeArticleTemplate =
  Database['public']['Tables']['knowledge_article_templates']['Row']
export type KnowledgeGroupTemplate =
  Database['public']['Tables']['knowledge_group_templates']['Row']

// Статья базы знаний с данными связи
export interface KnowledgeArticleWithRelation extends KnowledgeArticleTemplate {
  knowledge_article: KnowledgeArticle
}

// Группа базы знаний с данными связи
export interface KnowledgeGroupWithRelation extends KnowledgeGroupTemplate {
  knowledge_group: KnowledgeGroup
}
