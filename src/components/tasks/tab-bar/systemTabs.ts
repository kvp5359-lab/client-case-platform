/**
 * Реестр системных вкладок TaskPanel: тип + название + иконка.
 * Используется для add-popover (кнопка [+]) и для отображения иконок
 * системных вкладок в баре.
 */

import {
  Bot,
  Settings2,
  History,
  FileText,
  ListChecks,
  FormInput,
  BookOpen,
  Lock,
} from 'lucide-react'
import type { TaskPanelTabType } from '@/types/taskPanelTabs'

export type SystemTabDef = {
  type: Exclude<TaskPanelTabType, 'thread' | 'knowledge_article'>
  title: string
  icon: React.ComponentType<{ className?: string }>
}

export const SYSTEM_TABS: SystemTabDef[] = [
  { type: 'tasks',      title: 'Задачи',             icon: ListChecks },
  { type: 'history',    title: 'История',            icon: History },
  { type: 'documents',  title: 'Документы',          icon: FileText },
  { type: 'forms',      title: 'Анкеты',             icon: FormInput },
  { type: 'materials',  title: 'Полезные материалы', icon: BookOpen },
  { type: 'project_context', title: 'Контекст проекта', icon: Lock },
  { type: 'assistant',  title: 'Ассистент',          icon: Bot },
  { type: 'extra',      title: 'Дополнительно',      icon: Settings2 },
]

export const SYSTEM_TAB_BY_TYPE = new Map<string, SystemTabDef>(
  SYSTEM_TABS.map((d) => [d.type, d]),
)
