/**
 * Реестр модулей проекта
 *
 * Каждый модуль описан в одном месте: id, название, иконка,
 * ключ в enabled_modules шаблона, ключ для проверки прав, порядок.
 *
 * Чтобы добавить новый модуль — добавь элемент в массив PROJECT_MODULES.
 * ProjectPage автоматически подхватит его: покажет вкладку и содержимое.
 */

import {
  Settings,
  CheckSquare,
  MessageSquare,
  History,
  FileText,
  DollarSign,
  FolderOpen,
  BookOpen,
  NotebookText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ProjectModule as ProjectModuleKey, WorkspaceFeature } from '@/types/permissions'

export interface ModuleDefinition {
  /** Уникальный id модуля — используется в URL (?tab=tasks) */
  id: string
  /** Название вкладки */
  label: string
  /** Иконка lucide-react */
  icon: LucideIcon
  /** Порядок отображения (меньше = левее) */
  order: number
  /**
   * Ключ в массиве enabled_modules шаблона проекта.
   * Если null — модуль доступен всегда (не зависит от шаблона).
   */
  templateKey: string | null
  /**
   * Ключ для проверки прав через hasModuleAccess().
   * Если null — доступен всем.
   */
  permissionKey: ProjectModuleKey | null
  /**
   * Ключ фичи воркспейса (isFeatureEnabled).
   * Если null — не зависит от фич воркспейса.
   */
  featureKey?: WorkspaceFeature | null
  /**
   * Показывать ли вкладку в TabsList.
   * false — модуль участвует в логике, но вкладки не имеет (например aiChat).
   */
  showTab?: boolean
  /** Показывать только иконку (без текста) для экономии места */
  iconOnly?: boolean
}

/**
 * Реестр всех модулей проекта.
 * Порядок в массиве = порядок вкладок.
 */
export const PROJECT_MODULES: ModuleDefinition[] = [
  // === Основные вкладки ===
  {
    id: 'tasks',
    label: 'Задачи',
    icon: CheckSquare,
    order: 1,
    templateKey: 'tasks',
    permissionKey: 'tasks',
  },
  // Чаты живут в правой панели, отдельной вкладки нет (showTab: false).
  // Модуль управляет видимостью мессенджер-панели.
  {
    id: 'chats',
    label: 'Чаты',
    icon: MessageSquare,
    order: 99,
    templateKey: 'chats',
    permissionKey: 'chats',
    showTab: false,
  },
  {
    id: 'documents',
    label: 'Документы',
    icon: FolderOpen,
    order: 2,
    templateKey: null,
    permissionKey: 'documents',
  },
  {
    id: 'forms',
    label: 'Анкеты',
    icon: FileText,
    order: 3,
    templateKey: 'forms',
    permissionKey: 'forms',
  },
  {
    id: 'knowledge-base',
    label: 'Полезные материалы',
    icon: BookOpen,
    order: 4,
    templateKey: 'knowledge_base',
    permissionKey: 'knowledge_base',
  },
  {
    id: 'history',
    label: 'История',
    icon: History,
    order: 5,
    templateKey: null,
    permissionKey: 'history',
    iconOnly: true,
  },
  {
    id: 'digest',
    label: 'Дневник',
    icon: NotebookText,
    order: 5.5,
    templateKey: null,
    permissionKey: 'digest',
    iconOnly: true,
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: Settings,
    order: 0,
    templateKey: null,
    permissionKey: 'settings',
    iconOnly: true,
  },
  // === Дополнительные вкладки ===
  {
    id: 'finances',
    label: 'Финансы',
    icon: DollarSign,
    order: 9,
    templateKey: 'finances',
    permissionKey: 'finance',
    iconOnly: true,
  },
]
