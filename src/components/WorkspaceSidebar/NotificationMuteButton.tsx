"use client"

/**
 * Кнопка-колокольчик «тишина» (Do Not Disturb) в сайдбаре.
 * Клик → поповер с пресетами заглушения: 30 мин / 1 час / 4 часа / до утра /
 * насовсем. Когда уведомления заглушены — перечёркнутый колокольчик + строка
 * статуса «до 14:30» / «насовсем» + пункт «Включить».
 *
 * Глушит всплывающие уведомления о новых сообщениях и звук (см.
 * useNewMessageToast). Состояние — пер-пользователь/пер-воркспейс на сервере.
 */

import { useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotificationMute, type MutePreset } from '@/hooks/useNotificationMute'

const PRESETS: { preset: MutePreset; label: string }[] = [
  { preset: '30m', label: 'На 30 минут' },
  { preset: '1h', label: 'На 1 час' },
  { preset: '4h', label: 'На 4 часа' },
  { preset: 'morning', label: 'До утра' },
  { preset: 'forever', label: 'Насовсем' },
]

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function NotificationMuteButton({ workspaceId }: { workspaceId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const { isMuted, mutedUntil, isForever, mute, unmute } = useNotificationMute(workspaceId)

  if (!workspaceId) return null

  const statusText = isForever
    ? 'насовсем'
    : mutedUntil
      ? `до ${formatTime(mutedUntil)}`
      : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={isMuted ? `Уведомления заглушены ${statusText}` : 'Заглушить уведомления'}
          aria-label={isMuted ? `Уведомления заглушены ${statusText}` : 'Заглушить уведомления'}
          className={`shrink-0 flex items-center justify-center h-6 w-6 rounded transition-colors ${
            isMuted
              ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
        >
          {isMuted ? <BellOff className="h-[15px] w-[15px]" /> : <Bell className="h-[15px] w-[15px]" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-56 p-1.5">
        <div className="px-2 py-0.5 mb-0.5 text-[11px] font-medium text-gray-400">
          {isMuted ? `Заглушено ${statusText}` : 'Заглушить уведомления'}
        </div>

        {PRESETS.map((p) => (
          <button
            key={p.preset}
            type="button"
            onClick={() => {
              mute(p.preset)
              setOpen(false)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-gray-100 transition-colors text-left"
          >
            <BellOff className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="flex-1 min-w-0 truncate">{p.label}</span>
          </button>
        ))}

        {isMuted && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              type="button"
              onClick={() => {
                unmute()
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors text-left"
            >
              <BellRing className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0 truncate">Включить уведомления</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
