/**
 * Боковая панель фильтрации участников по ролям.
 * Использует общий SettingsSubNav (единый стиль панелей настроек).
 */

import { MessageSquare } from 'lucide-react'
import { ROLE_CONFIG, TELEGRAM_ROLE } from '../constants/roleConfig'
import { SettingsSubNav, type SettingsSubNavGroup } from './SettingsSubNav'

type ParticipantsSidebarProps = {
  selectedRole: string | 'all'
  onSelectRole: (role: string | 'all') => void
  roleStats: Record<string, number>
  telegramCount: number
}

export function ParticipantsSidebar({
  selectedRole,
  onSelectRole,
  roleStats,
  telegramCount,
}: ParticipantsSidebarProps) {
  const groups: SettingsSubNavGroup[] = [
    { items: [{ id: 'all', label: 'Все участники', count: roleStats.all }] },
    {
      title: 'По ролям',
      items: ROLE_CONFIG.map((role) => ({
        id: role.key,
        label: role.label,
        icon: role.icon,
        count: roleStats[role.statsKey],
      })),
    },
    ...(telegramCount > 0
      ? [
          {
            title: 'Telegram',
            items: [
              {
                id: TELEGRAM_ROLE,
                label: 'Telegram-контакты',
                icon: MessageSquare,
                count: telegramCount,
              },
            ],
          } satisfies SettingsSubNavGroup,
        ]
      : []),
  ]

  return (
    <SettingsSubNav
      groups={groups}
      activeId={selectedRole}
      onSelect={(id) => onSelectRole(id)}
    />
  )
}
