"use client"

/**
 * Инлайн-панель настроек выбранного поля в Card Layout.
 * Управляет fontSize/align/truncate/bold.
 */

import { AlignLeft, AlignRight } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { CardFieldId, CardFieldStyle } from '../types'
import { getFieldLabel, CARD_FONT_SIZES, CARD_TRUNCATES } from '../listSettingsConfigs'

const ALIGNS: { value: 'left' | 'right'; icon: React.ElementType }[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'right', icon: AlignRight },
]

export function FieldStyleEditor({
  fieldId,
  style,
  onStyleChange,
  onClose,
}: {
  fieldId: CardFieldId
  style: CardFieldStyle
  onStyleChange: (patch: Partial<CardFieldStyle>) => void
  onClose: () => void
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{getFieldLabel(fieldId)}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Закрыть
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-muted-foreground mr-1">Размер</Label>
          {CARD_FONT_SIZES.map((fs) => (
            <button
              key={fs.value}
              type="button"
              onClick={() => onStyleChange({ fontSize: fs.value })}
              className={cn(
                'h-7 w-7 rounded text-xs border transition-colors',
                style.fontSize === fs.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50',
              )}
            >
              {fs.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-muted-foreground mr-1">Выр.</Label>
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => onStyleChange({ align: a.value })}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded border transition-colors',
                style.align === a.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
            >
              <a.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Label className="text-[11px] text-muted-foreground mr-1">Текст</Label>
          {CARD_TRUNCATES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onStyleChange({ truncate: t.value })}
              className={cn(
                'h-7 px-2 rounded text-xs border transition-colors',
                style.truncate === t.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-[11px] text-muted-foreground">Жирный</Label>
          <Switch
            checked={style.bold}
            onCheckedChange={(checked) => onStyleChange({ bold: checked })}
          />
        </div>
      </div>
    </div>
  )
}
