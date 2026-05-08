"use client"

/**
 * Sticky-баннер сверху приложения, когда активна импersonация.
 * Показывает имя/email просматриваемого пользователя, таймер до истечения JWT
 * и кнопку «Выйти из режима».
 *
 * При истечении JWT (через 30 мин) автоматически инициирует exit.
 */

import { useEffect, useState } from 'react'
import { Eye, LogOut } from 'lucide-react'
import { useImpersonation } from '@/hooks/useImpersonation'
import { Button } from '@/components/ui/button'

function formatRemaining(expiresAt: number | null): string {
  if (!expiresAt) return ''
  const nowSec = Math.floor(Date.now() / 1000)
  const diff = expiresAt - nowSec
  if (diff <= 0) return 'истёк'
  const mins = Math.floor(diff / 60)
  const secs = diff % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ImpersonationBanner() {
  const { isActive, targetEmail, expiresAt, end } = useImpersonation()
  const [, force] = useState(0)

  // Тикаем раз в секунду для таймера + автогашение при истечении.
  useEffect(() => {
    if (!isActive) return
    const id = window.setInterval(() => {
      force((v) => v + 1)
      if (expiresAt && Math.floor(Date.now() / 1000) >= expiresAt) {
        end().catch(() => {
          /* ignore */
        })
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [isActive, expiresAt, end])

  if (!isActive) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full border-b border-orange-300 bg-orange-100 text-orange-950 shadow-sm"
    >
      <div className="mx-auto flex max-w-[1700px] items-center gap-3 px-4 py-2 text-sm">
        <Eye className="h-4 w-4 shrink-0" />
        <div className="flex-1 leading-tight">
          <span className="font-medium">Режим просмотра:</span>{' '}
          вы видите сервис глазами{' '}
          <span className="font-mono text-orange-900">{targetEmail ?? '—'}</span>.
          Любые изменения отключены.
        </div>
        <div className="hidden text-xs tabular-nums text-orange-800 sm:block">
          осталось: {formatRemaining(expiresAt)}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-orange-400 bg-white text-orange-900 hover:bg-orange-50"
          onClick={() => {
            void end()
          }}
        >
          <LogOut className="mr-1 h-3.5 w-3.5" />
          Выйти из режима
        </Button>
      </div>
    </div>
  )
}
