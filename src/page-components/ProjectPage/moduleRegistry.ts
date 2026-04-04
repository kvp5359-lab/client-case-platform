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
  History,
  FileText,
  DollarSign,
  FolderOpen,
  BookOpen,
  MessageSquare,
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
    id: 'documents',
    label: 'Документы',
    icon: FolderOpen,
    order: 1,
    templateKey: null,
    permissionKey: 'card_view',
  },
  {
    id: 'forms',
    label: 'Анкеты',
    icon: FileText,
    order: 2,
    templateKey: 'forms',
    permissionKey: 'forms',
  },
  {
    id: 'tasks',
    label: 'Задачи',
    icon: CheckSquare,
    order: 3,
    templateKey: 'tasks',
    permissionKey: 'tasks',
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
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: Settings,
    order: 6,
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
  },
  // === Скрытые модули (без вкладок) ===
  {
    id: 'messenger',
    label: 'Сообщения',
    icon: MessageSquare,
    order: 10,
    templateKey: 'messenger',
    permissionKey: 'messenger',
    showTab: false,
  },
  {
    id: 'internal-messenger',
    label: 'Командный чат',
    icon: MessageSquare,
    order: 11,
    templateKey: 'internal_messenger',
    permissionKey: 'internal_messenger',
    showTab: false,
  },
]
