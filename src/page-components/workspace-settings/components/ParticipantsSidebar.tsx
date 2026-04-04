/**
 * Боковая панель фильтрации участников по ролям
 */

import { Badge } from '@/components/ui/badge'
import { MessageSquare } from 'lucide-react'
import { ROLE_CONFIG, TELEGRAM_ROLE } from '../constants/roleConfig'

interface ParticipantsSidebarProps {
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
  const isTelegramSection = selectedRole === TELEGRAM_ROLE

  return (
    <aside className="w-56 border-r bg-white p-3 flex-shrink-0">
      <nav className="space-y-1">
        {/* Все участники */}
        <button
          onClick={() => onSelectRole('all')}
          className={`
            w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between
            ${
              selectedRole === 'all'
                ? 'bg-amber-100 text-amber-900 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }
          `}
        >
          <span>Все участники</span>
          <Badge variant="secondary" className="ml-2 text-xs">
            {roleStats.all}
          </Badge>
        </button>

        {/* Роли */}
        <div className="pt-4">
          <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            По ролям
          </p>
          <div className="space-y-0.5">
            {ROLE_CONFIG.map((role) => {
              const Icon = role.icon
              return (
                <button
                  key={role.key}
                  onClick={() => onSelectRole(role.key)}
                  className={`
                    w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between
                    ${
                      selectedRole === role.key
                        ? 'bg-amber-100 text-amber-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {role.label}
                  </span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {roleStats[role.statsKey]}
                  </Badge>
                </button>
              )
            })}
          </div>
        </div>

        {/* Telegram-контакты */}
        {telegramCount > 0 && (
          <div className="pt-4">
            <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              Telegram
            </p>
            <button
              onClick={() => onSelectRole(TELEGRAM_ROLE)}
              className={`
                w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between
                ${
                  isTelegramSection
                    ? 'bg-amber-100 text-amber-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Telegram-контакты
              </span>
              <Badge variant="secondary" className="ml-2 text-xs">
                {telegramCount}
              </Badge>
            </button>
          </div>
        )}
      </nav>
    </aside>
  )
}
