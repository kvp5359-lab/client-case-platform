"use client"

/**
 * Секция переключения «Профиля настроек» внутри дропдауна карточки пользователя.
 * Показывает список общих профилей воркспейса (активный — с галочкой), позволяет
 * переключиться и перейти к управлению профилями (вкладка «Сайдбар» настроек).
 */

import { useRouter } from 'next/navigation'
import { Check, SlidersHorizontal, Settings2 } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  useInterfacePresets,
  useActiveInterfacePreset,
  useSetActivePreset,
} from '@/hooks/useInterfacePresets'

export function ProfileSwitcherSection({
  workspaceId,
}: {
  workspaceId: string | undefined
}) {
  const router = useRouter()
  const { data: presets = [] } = useInterfacePresets(workspaceId)
  const { presetId: activeId } = useActiveInterfacePreset(workspaceId)
  const setActive = useSetActivePreset()

  if (!workspaceId) return null

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 text-xs text-gray-500 font-normal">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Профиль настроек
      </DropdownMenuLabel>

      {presets.map((preset) => {
        const isActive = preset.id === activeId
        return (
          <DropdownMenuItem
            key={preset.id}
            className="cursor-pointer"
            onClick={() => {
              if (isActive) return
              setActive.mutate({ workspaceId, presetId: preset.id })
            }}
          >
            <span className="flex-1 truncate">{preset.name}</span>
            {isActive && <Check className="ml-2 h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        )
      })}

      <DropdownMenuItem
        className="cursor-pointer text-gray-600"
        onClick={() => router.push(`/workspaces/${workspaceId}/settings/sidebar`)}
      >
        <Settings2 className="mr-2 h-4 w-4" />
        Управление профилями
      </DropdownMenuItem>

      <DropdownMenuSeparator />
    </>
  )
}
