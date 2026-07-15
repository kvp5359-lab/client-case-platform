"use client"

import { HelpCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** Подсказка «?» рядом с подписью поля — вместо простыни поясняющего текста. */
export function HelpHint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-muted-foreground"
            aria-label="Подсказка"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs text-xs font-normal">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Строка настройки: подпись + «?» + опциональное действие справа. */
export function FieldRow({
  label,
  hint,
  action,
  children,
}: {
  label: string
  hint: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          <HelpHint text={hint} />
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
