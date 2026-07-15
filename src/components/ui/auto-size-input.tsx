import * as React from 'react'

import { cn } from '@/lib/utils'

type AutoSizeInputProps = {
  value: string
  onChange: (value: string) => void
  /**
   * Шрифтовые классы. Применяются и к инпуту, и к невидимому двойнику, который
   * задаёт ширину, — если их развести, замер поедет и поле будет не по тексту.
   */
  className?: string
  /** Классы только для инпута (рамка, цвет) — на замер ширины не влияют. */
  inputClassName?: string
  /** Классы контейнера (например, max-w). */
  containerClassName?: string
  /**
   * По какому тексту мерить ширину, пока value пуст. Обычно placeholder —
   * иначе пустое поле схлопнется в ноль и placeholder будет не прочитать.
   */
  measureFallback?: string
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'className'>

/**
 * Инпут шириной ровно по своему тексту.
 *
 * Невидимый двойник и инпут лежат в одной ячейке грида: ширину ячейки задаёт
 * двойник, инпут её занимает. Так поле растёт за текстом без замеров в JS
 * (никаких ref + measure + setState на каждый ввод).
 */
export const AutoSizeInput = React.forwardRef<HTMLInputElement, AutoSizeInputProps>(
  function AutoSizeInput(
    { value, onChange, className, inputClassName, containerClassName, measureFallback, ...props },
    ref,
  ) {
    return (
      <span className={cn('inline-grid', containerClassName)}>
        <span
          aria-hidden
          className={cn('invisible col-start-1 row-start-1 whitespace-pre', className)}
        >
          {value || measureFallback || ' '}
        </span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none',
            className,
            inputClassName,
          )}
          {...props}
        />
      </span>
    )
  },
)
