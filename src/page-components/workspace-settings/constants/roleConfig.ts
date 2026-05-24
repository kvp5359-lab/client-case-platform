/**
 * UI-конфигурация для 4 фиксированных системных workspace-ролей: иконка,
 * единственное и множественное число, ключ для статистики. Сами роли
 * хранятся в БД (`workspace_roles`), но эта четвёрка — системная (с этими
 * именами завязаны permissions, RLS и логика onboarding'а), и её иконки/
 * лейблы живут здесь, а не подтягиваются динамически из БД.
 */

import { Crown, Users, Link, HandshakeIcon, Contact, type LucideIcon } from 'lucide-react'

export type RoleConfigItem = {
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
  {
    key: 'Внешний контакт',
    label: 'Внешний контакт',
    pluralLabel: 'Внешние контакты',
    icon: Contact,
    statsKey: 'external_contact',
  },
]

export const TELEGRAM_ROLE = 'Telegram-контакт'
