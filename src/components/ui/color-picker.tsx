/**
 * ColorPicker — компактный пикер цвета с поповером и 24 пресетами
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'

const PRESET_COLORS = [
  // Ряд 1 — яркие
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  // Ряд 2 — глубокие / пастельные / нейтральные
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#FB923C',
  '#1E3A5F',
  '#1F2937',
  '#4B5563',
  '#6B7280',
  '#9CA3AF',
  '#D1D5DB',
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
  presetColors?: string[]
  /** Если строка непустая — рендерим Label сверху. Пустая строка — без лейбла. */
  label?: string
  /** Скрыть HEX-текст в триггере, оставить только цветной кружок. */
  hideTriggerText?: boolean
  /**
   * Минималистичный триггер — только цветной кружок, без рамки/фона/паддинга.
   * Полезно, когда пикер встроен в составной UI (например, рядом с другим
   * контролом, который сам задаёт визуальный контейнер).
   */
  bareTrigger?: boolean
}

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  presetColors = PRESET_COLORS,
  label = 'Цвет',
  hideTriggerText = false,
  bareTrigger = false,
}: ColorPickerProps) {
  return (
    <div className={label ? 'space-y-2' : undefined}>
      {label ? <Label>{label}</Label> : null}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              bareTrigger
                ? 'flex items-center justify-center rounded-full transition-transform hover:scale-110'
                : 'flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            aria-label={bareTrigger ? `Цвет ${value}` : undefined}
          >
            <div
              className={cn(
                'rounded-full flex-shrink-0',
                bareTrigger ? 'w-7 h-7 border border-gray-200' : 'w-5 h-5 border border-gray-300',
              )}
              style={{ backgroundColor: safeCssColor(value) }}
            />
            {!hideTriggerText && !bareTrigger && (
              <span className="text-sm text-muted-foreground">{value}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3" align="start">
          <div className="grid grid-cols-6 gap-2">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  'w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
                  value === color
                    ? 'border-gray-900 scale-110 ring-2 ring-offset-1 ring-gray-400'
                    : 'border-transparent',
                )}
                style={{ backgroundColor: safeCssColor(color) }}
                onClick={() => onChange(color)}
                aria-pressed={value === color}
                aria-label={`Цвет ${color}`}
              />
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex items-center gap-2">
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(safeCssColor(e.target.value))}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
              disabled={disabled}
              aria-label="Выбрать произвольный цвет"
            />
            <span className="text-xs text-muted-foreground">Произвольный цвет</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
