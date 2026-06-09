"use client"

/**
 * Сворачиваемая строка одной интеграции в профиле.
 *
 * Компактный заголовок: иконка + название + статус (точка) + шеврон.
 * По клику разворачивает детали (кнопки, адреса, подключение). По умолчанию
 * свёрнуто. Используется внутри единой карточки «Интеграции».
 */

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type IntegrationTone = 'ok' | 'warn' | 'off'

const TEXT_TONE: Record<IntegrationTone, string> = {
  ok: 'text-emerald-600',
  warn: 'text-amber-600',
  off: 'text-muted-foreground',
}
const DOT_TONE: Record<IntegrationTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  off: 'bg-gray-300',
}

export function IntegrationRow({
  icon,
  title,
  statusLabel,
  tone = 'off',
  defaultOpen = false,
  children,
}: {
  icon: ReactNode
  title: string
  statusLabel: string
  tone?: IntegrationTone
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors">
        <span className="shrink-0 flex items-center justify-center w-8 h-8">{icon}</span>
        <span className="font-medium text-sm truncate">{title}</span>
        <span className={cn('ml-auto flex items-center gap-1.5 text-xs shrink-0', TEXT_TONE[tone])}>
          <span className={cn('inline-block w-1.5 h-1.5 rounded-full', DOT_TONE[tone])} />
          {statusLabel}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform shrink-0',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
