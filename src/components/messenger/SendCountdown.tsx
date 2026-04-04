/**
 * Countdown badge under a message bubble for delayed send.
 * Shows remaining seconds and a cancel button.
 */

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface SendCountdownProps {
  expiresAt: number
  onCancel: () => void
}

export function SendCountdown({ expiresAt, onCancel }: SendCountdownProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  )

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setRemaining(r)
      if (r <= 0) clearInterval(interval)
    }, 100)
    return () => clearInterval(interval)
  }, [expiresAt])

  if (remaining <= 0) return null

  return (
    <div className="flex justify-end mt-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onCancel()
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-medium shadow-sm transition-colors"
        title="Отменить отправку"
      >
        <X className="h-3 w-3" />
        Отменить ({remaining})
      </button>
    </div>
  )
}
