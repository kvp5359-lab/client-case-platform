"use client"

/**
 * FloatingField — поле с плавающим лейблом в стиле Material Design (outlined)
 *
 * Когда поле пустое и не в фокусе — лейбл внутри по центру (placeholder-стиль)
 * Когда поле заполнено или в фокусе — лейбл поднимается на рамку, фон белый за ним
 * Рамка: border-2, при фокусе — border-primary, заполненное — border-green-500
 * Крестик очистки появляется при наведении на заполненное поле
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { RISK_COLORS, type RiskLevel } from './riskLevels'
import { RiskLevelPopover } from './RiskLevelPopover'

type FloatingFieldProps = {
  label: string
  isRequired?: boolean
  description?: string | null
  isFilled: boolean
  alwaysFloat?: boolean
  /** Многострочное поле (textarea) — убирает фиксированную высоту, лейбл всегда всплывает */
  multiline?: boolean
  /** Дополнительный отступ лейбла слева (px), когда он внутри поля (не floating) */
  labelInset?: number
  className?: string
  onClear?: () => void
  /** У поля есть своя иконка справа (напр. стрелка select) — маркер риска сдвигается левее. */
  hasRightAdornment?: boolean
  /** Поле поддерживает риск-оценку (из шаблона). */
  riskEnabled?: boolean
  /** Текущая оценка риска (null = не проставлена). */
  riskLevel?: RiskLevel | null
  /** Может ли текущий пользователь ставить оценку (сотрудник). От клиента контрол скрыт. */
  canSetRisk?: boolean
  onRiskChange?: (value: RiskLevel | null) => void
  children: (props: {
    isFocused: boolean
    onFocus: () => void
    onBlur: () => void
  }) => React.ReactNode
}

export function FloatingField({
  label,
  isRequired,
  description,
  isFilled,
  alwaysFloat,
  multiline,
  labelInset,
  className,
  onClear,
  hasRightAdornment,
  riskEnabled,
  riskLevel,
  canSetRisk,
  onRiskChange,
  children,
}: FloatingFieldProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout при unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  const isFloating = isFocused || isFilled || alwaysFloat

  const handleFocus = useCallback(() => setIsFocused(true), [])

  const handleBlur = useCallback(() => {
    // Очищаем предыдущий таймаут
    const timeout = blurTimeoutRef.current
    if (timeout) clearTimeout(timeout)

    // Проверяем, остался ли фокус внутри контейнера или внутри портала (для select/datepicker)
    blurTimeoutRef.current = setTimeout(() => {
      const active = document.activeElement
      if (!active) {
        setIsFocused(false)
        return
      }
      // Фокус внутри контейнера — оставляем focused
      if (containerRef.current?.contains(active)) return
      // Фокус внутри Radix-портала (popover/select) — оставляем focused
      if (active.closest('[data-radix-popper-content-wrapper]')) return
      setIsFocused(false)
    }, 0)
  }, [])

  // мемоизация childrenProps — предотвращает лишние ререндеры дочерних компонентов
  const childrenProps = useMemo(
    () => ({ isFocused, onFocus: handleFocus, onBlur: handleBlur }),
    [isFocused, handleFocus, handleBlur],
  )
  const showClear = isFilled && isHovered && onClear
  const showRisk = !!(riskEnabled && canSetRisk && onRiskChange)

  // Цвет контура заполненного поля: при проставленной риск-оценке — в цвет индикатора,
  // иначе чёрный (тема foreground). Незаполненное поле — серый border-border.
  const filledBorderColor = riskLevel ? RISK_COLORS[riskLevel] : 'hsl(var(--foreground))'
  // Цвет толстой левой полосы риска (border-l-4 как у баблов):
  // оценка проставлена → цвет оценки; иначе — в тон основного контура (намёк только толщиной).
  const riskBarColor = riskLevel
    ? RISK_COLORS[riskLevel]
    : isFilled
      ? filledBorderColor // заполнено — чёрный, как остальной контур
      : undefined // пусто — оставляем border-border (серый) из className

  // Раздельные border*Color (не shorthand borderColor) — иначе конфликт с borderLeftColor.
  const fieldStyle: React.CSSProperties = {}
  if (isFilled) {
    fieldStyle.borderTopColor = filledBorderColor
    fieldStyle.borderRightColor = filledBorderColor
    fieldStyle.borderBottomColor = filledBorderColor
  }
  if (showRisk) {
    fieldStyle.borderLeftWidth = 4
    if (riskBarColor) fieldStyle.borderLeftColor = riskBarColor
  } else if (isFilled) {
    fieldStyle.borderLeftColor = filledBorderColor
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', showRisk && 'group', className)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Маркер риск-оценки — справа, слева от крестика. Сама полоса риска = левая граница поля. */}
      {showRisk && (
        <RiskLevelPopover
          value={riskLevel ?? null}
          onChange={(v) => onRiskChange?.(v)}
          className={cn(
            'absolute z-20 h-5 w-5',
            multiline ? 'top-2' : 'top-1/2 -translate-y-1/2',
            // слева от крестика очистки; у select — левее его стрелки; иначе у правого края
            showClear ? 'right-7' : hasRightAdornment ? 'right-8' : 'right-2',
          )}
        />
      )}
      {/* Контейнер поля */}
      <div
        className={cn(
          'w-full rounded-2xl bg-transparent px-[14px] pt-2.5 pb-2 text-sm transition-all duration-200',
          multiline ? 'min-h-10' : 'h-10',
          isFocused ? 'border-2' : 'border',
          isFocused && 'shadow-[0_4px_16px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]',
          !isFilled && 'border-border',
        )}
        style={fieldStyle}
      >
        {/* eslint-disable-next-line react-hooks/refs -- handleBlur reads blurTimeoutRef but is never called during render */}
        {children(childrenProps)}
      </div>

      {/* Кнопка очистки */}
      {showClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
            setIsFocused(false)
          }}
          className={cn(
            'absolute right-2 p-0.5 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors',
            multiline ? 'top-2' : 'top-1/2 -translate-y-1/2',
          )}
          aria-label="Очистить поле"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Плавающий лейбл */}
      <label
        className={cn(
          'absolute px-[5px] transition-all duration-200 pointer-events-none bg-background flex items-center gap-1 max-w-[calc(100%-40px)]',
          isFloating
            ? '-top-[7px] left-[9px] text-xs'
            : multiline
              ? 'top-2.5 text-sm'
              : 'top-1/2 -translate-y-1/2 text-sm',
          !isFilled && 'text-gray-400',
        )}
        style={{
          ...(!isFloating ? { left: 9 + (labelInset ?? 0) } : {}),
          ...(isFilled ? { color: filledBorderColor } : {}),
        }}
      >
        <span className="truncate">{label}</span>
        {isRequired && <span className="text-destructive shrink-0">*</span>}
        {description && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="pointer-events-auto text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                onClick={(e) => e.stopPropagation()}
                aria-label="Справка"
              >
                <HelpCircle className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-sm" align="start">
              <p className="text-sm text-muted-foreground">{description}</p>
            </PopoverContent>
          </Popover>
        )}
      </label>
    </div>
  )
}
