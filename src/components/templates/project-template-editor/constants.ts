/**
 * Константы и типы для ProjectTemplateEditorPage
 */

import {
  FileText,
  FolderOpen,
  DollarSign,
  CheckSquare,
  MessageSquare,
  MessagesSquare,
  BookOpen,
  Lock,
  Compass,
} from 'lucide-react'
import type { Database } from '@/types/database'

// Доступные модули для проекта.
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
    description: 'Задачи проекта',
  },
  {
    id: 'chats',
    label: 'Чаты',
    icon: MessagesSquare,
    description: 'Клиентские чаты и командный чат проекта',
  },
  {
    id: 'ai_chat',
    label: 'AI-ассистент',
    icon: MessageSquare,
    description: 'Общение с нейросетью по документам проекта',
  },
  {
    id: 'visa_selection',
    label: 'Подбор ВНЖ',
    icon: Compass,
    description: 'Подбор видов на жительство по анкете клиента',
  },
  {
    id: 'knowledge_base',
    label: 'База знаний',
    icon: BookOpen,
    description: 'Полезные материалы для клиентов',
  },
  {
    id: 'project_context',
    label: 'Контекст проекта',
    icon: Lock,
    description: 'Внутренние материалы команды — заметки, файлы, скриншоты. Не видны клиентам.',
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
export type FormTemplateWithRelation = {
  form_template: FormTemplate
} & ProjectTemplateForm

// Шаблон набора документов с данными
export type DocumentKitTemplateWithRelation = {
  document_kit_template: DocumentKitTemplate
} & ProjectTemplateDocumentKit

// Типы для базы знаний
export type KnowledgeArticle = Database['public']['Tables']['knowledge_articles']['Row']
export type KnowledgeGroup = Database['public']['Tables']['knowledge_groups']['Row']
export type KnowledgeArticleTemplate =
  Database['public']['Tables']['knowledge_article_templates']['Row']
export type KnowledgeGroupTemplate =
  Database['public']['Tables']['knowledge_group_templates']['Row']

// Статья базы знаний с данными связи
export type KnowledgeArticleWithRelation = {
  knowledge_article: KnowledgeArticle
} & KnowledgeArticleTemplate

// Группа базы знаний с данными связи
export type KnowledgeGroupWithRelation = {
  knowledge_group: KnowledgeGroup
} & KnowledgeGroupTemplate
