"use client"

import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { CardFieldId, CardFieldStyle } from './types'
import { getFieldLabel, CARD_FONT_SIZES, CARD_TRUNCATES } from './listSettingsConfigs'

const ALIGNS: { value: 'left' | 'center' | 'right'; icon: React.ElementType }[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
]

interface CardFieldStylePopoverProps {
  fieldId: CardFieldId
  style: CardFieldStyle
  open: boolean
  onOpenChange: (open: boolean) => void
  onStyleChange: (patch: Partial<CardFieldStyle>) => void
  children: React.ReactNode
}

export function CardFieldStylePopover({
  fieldId,
  style,
  open,
  onOpenChange,
  onStyleChange,
  children,
}: CardFieldStylePopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-52 p-3 space-y-3" align="start" side="bottom">
        <p className="text-xs font-medium text-foreground">{getFieldLabel(fieldId)}</p>

        {/* Размер шрифта */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Размер</Label>
          <div className="flex gap-1">
            {CARD_FONT_SIZES.map((fs) => (
              <button
                key={fs.value}
                type="button"
                onClick={() => onStyleChange({ fontSize: fs.value })}
                className={cn(
                  'flex-1 py-1 rounded text-xs border transition-colors',
                  style.fontSize === fs.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {fs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Выравнивание */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Выравнивание</Label>
          <div className="flex gap-1">
            {ALIGNS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => onStyleChange({ align: a.value })}
                className={cn(
                  'flex-1 flex items-center justify-center py-1 rounded border transition-colors',
                  style.align === a.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50',
                )}
              >
                <a.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Перенос */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Текст</Label>
          <div className="flex gap-1">
            {CARD_TRUNCATES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onStyleChange({ truncate: t.value })}
                className={cn(
                  'flex-1 py-1 rounded text-xs border transition-colors',
                  style.truncate === t.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Жирный */}
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Жирный</Label>
          <Switch
            checked={style.bold}
            onCheckedChange={(checked) => onStyleChange({ bold: checked })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
