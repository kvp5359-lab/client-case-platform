"use client"

/**
 * Панель управления «Профилями настроек» над редактором сайдбара.
 * Чипы профилей (активный подсвечен) + создать / переименовать / дублировать / удалить.
 * Редактор ниже всегда правит АКТИВНЫЙ профиль, поэтому переключение чипа меняет то,
 * что редактируется. При переключении сбрасываем несохранённые правки (onBeforeSwitch).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, MoreHorizontal, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useInterfacePresets,
  useActiveInterfacePreset,
  useSetActivePreset,
  useCreateInterfacePreset,
  useUpdateInterfacePreset,
  useDuplicateInterfacePreset,
  useDeleteInterfacePreset,
} from '@/hooks/useInterfacePresets'

export function ProfilesManagerBar({
  workspaceId,
  onBeforeSwitch,
}: {
  workspaceId: string
  onBeforeSwitch: () => void
}) {
  const { data: presets = [] } = useInterfacePresets(workspaceId)
  const { presetId: activeId } = useActiveInterfacePreset(workspaceId)
  const setActive = useSetActivePreset()
  const create = useCreateInterfacePreset()
  const updatePreset = useUpdateInterfacePreset()
  const duplicate = useDuplicateInterfacePreset()
  const remove = useDeleteInterfacePreset()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const startRename = (id: string, name: string) => {
    setRenamingId(id)
    setRenameValue(name)
  }

  const commitRename = async () => {
    const id = renamingId
    const name = renameValue.trim()
    setRenamingId(null)
    if (!id || !name) return
    try {
      await updatePreset.mutateAsync({ workspaceId, presetId: id, name })
    } catch (err) {
      toast.error('Не удалось переименовать', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleSwitch = (presetId: string) => {
    if (presetId === activeId) return
    onBeforeSwitch()
    setActive.mutate({ workspaceId, presetId })
  }

  const handleCreate = async () => {
    try {
      const id = await create.mutateAsync({ workspaceId, name: 'Новый профиль' })
      onBeforeSwitch()
      await setActive.mutateAsync({ workspaceId, presetId: id })
      startRename(id, 'Новый профиль')
    } catch (err) {
      toast.error('Не удалось создать профиль', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDuplicate = async (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    try {
      const id = await duplicate.mutateAsync({ workspaceId, preset })
      onBeforeSwitch()
      await setActive.mutateAsync({ workspaceId, presetId: id })
    } catch (err) {
      toast.error('Не удалось дублировать', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDelete = async (presetId: string) => {
    try {
      onBeforeSwitch()
      await remove.mutateAsync({ workspaceId, presetId })
      toast.success('Профиль удалён')
    } catch (err) {
      toast.error('Не удалось удалить', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-gray-700 mr-1">Профиль:</span>

      {presets.map((preset) => {
        const isActive = preset.id === activeId
        if (renamingId === preset.id) {
          return (
            <Input
              key={preset.id}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
              className="h-8 w-40"
            />
          )
        }
        return (
          <div
            key={preset.id}
            className={`flex items-center rounded-lg border transition-colors ${
              isActive
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <button
              type="button"
              onClick={() => handleSwitch(preset.id)}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm"
            >
              {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
              <span className="truncate max-w-[160px]">{preset.name}</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Действия профиля"
                  className="px-1.5 py-1.5 text-gray-400 hover:text-gray-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => startRename(preset.id, preset.name)}
                >
                  Переименовать
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => handleDuplicate(preset.id)}
                >
                  Дублировать
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  disabled={preset.is_default}
                  onClick={() => {
                    if (preset.is_default) return
                    handleDelete(preset.id)
                  }}
                >
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={handleCreate}
        disabled={create.isPending}
        className="h-8 gap-1"
      >
        {create.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Новый профиль
      </Button>
    </div>
  )
}
