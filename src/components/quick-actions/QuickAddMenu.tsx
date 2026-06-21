"use client"

/**
 * Универсальная кнопка «+» с настраиваемым меню быстрых действий.
 * Читает quick_actions активного «Профиля настроек», по клику исполняет действие
 * через общий раннер (QuickActionsProvider). Настройка — Настройки → Сайдбар.
 */

import { useRouter } from 'next/navigation'
import { Plus, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveInterfacePreset } from '@/hooks/useInterfacePresets'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { useQuickActionsRunner } from './QuickActionsProvider'

export function QuickAddMenu({
  workspaceId,
  compact,
}: {
  workspaceId: string | undefined
  compact?: boolean
}) {
  const router = useRouter()
  const { quickActions } = useActiveInterfacePreset(workspaceId)
  const { run } = useQuickActionsRunner()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Быстрое добавление"
          className={`flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ${
            compact ? 'h-9 w-9' : 'h-9 w-full gap-1.5 text-sm'
          }`}
        >
          <Plus className="h-4 w-4" />
          {!compact && 'Создать'}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {quickActions.length === 0 ? (
          <div className="px-2 py-3 text-xs text-gray-500">
            Быстрых действий пока нет. Настрой их в профиле.
          </div>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs text-gray-500 font-normal">
              Быстрое добавление
            </DropdownMenuLabel>
            {quickActions.map((action) => {
              const Icon = getChatIconComponent(action.icon)
              return (
                <DropdownMenuItem
                  key={action.id}
                  className="cursor-pointer"
                  onClick={() => run(action)}
                >
                  <Icon className="mr-2 h-4 w-4 text-gray-500" />
                  {action.label}
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-gray-600"
          onClick={() =>
            workspaceId && router.push(`/workspaces/${workspaceId}/settings/sidebar`)
          }
        >
          <Settings2 className="mr-2 h-4 w-4" />
          Настроить действия
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
