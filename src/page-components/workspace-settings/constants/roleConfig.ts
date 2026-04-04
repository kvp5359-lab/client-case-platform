/**
 * Конфигурация ролей workspace
 * TODO (Z5-10): Роли захардкожены — в будущем подтягивать из БД (таблица workspace_roles)
 */

import { Crown, Users, Link, HandshakeIcon, type LucideIcon } from 'lucide-react'

export interface RoleConfigItem {
  key: string
  label: string
  pluralLabel: string
  icon: LucideIcon
  statsKey: string
}

export const ROLE_CONFIG: RoleConfigItem[] = [
  {
    key: 'Администратор',
    label: 'Администратор',
    pluralLabel: 'Администраторы',
    icon: Crown,
    statsKey: 'admin',
  },
  {
    key: 'Сотрудник',
    label: 'Сотрудник',
    pluralLabel: 'Сотрудники',
    icon: Users,
    statsKey: 'employee',
  },
  {
    key: 'Внешний сотрудник',
    label: 'Внешний сотрудник',
    pluralLabel: 'Внешние сотрудники',
    icon: Link,
    statsKey: 'external',
  },
  {
    key: 'Клиент',
    label: 'Клиент',
    pluralLabel: 'Клиенты',
    icon: HandshakeIcon,
    statsKey: 'client',
  },
]

export const TELEGRAM_ROLE = 'Telegram-контакт'
