'use client'

import * as React from 'react'
import { format, isValid } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Вычисляется в момент рендера, а не при загрузке модуля */
function getCurrentYear() {
  return new Date().getFullYear()
}

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
}

/** Парсит строку в формате dd.MM.yyyy → Date, или null если невалидна */
function parseDdMmYyyy(value: string): Date | null {
  const parts = value.split('.')
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parseInt(parts[2], 10)
  const d = new Date(year, month, day)
  if (isValid(d) && d.getDate() === day && d.getMonth() === month && d.getFullYear() === year) {
    return d
  }
  return null
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = 'ДД/ММ/ГГГГ',
  disabled = false,
}: DatePickerProps) {
  const [inputValue, setInputValue] = React.useState('')
  const [isOpen, setIsOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Синхронизация inputValue с date
  React.useEffect(() => {
    if (date && isValid(date)) {
      setInputValue(format(date, 'dd.MM.yyyy', { locale: ru }))
    } else {
      setInputValue('')
    }
  }, [date])

  // Обработка ввода с маской
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value

    // Если пользователь стирает, разрешаем стирать точки
    if (rawValue.length < inputValue.length) {
      setInputValue(rawValue)

      // Если поле пустое, очищаем дату
      if (rawValue.length === 0) {
        onDateChange?.(undefined)
      }
      return
    }

    // Убираем всё, кроме цифр для нового ввода
    let value = rawValue.replace(/\D/g, '')

    // Применяем маску dd.mm.yyyy
    if (value.length >= 2) {
      value = value.slice(0, 2) + '.' + value.slice(2)
    }
    if (value.length >= 5) {
      value = value.slice(0, 5) + '.' + value.slice(5)
    }
    if (value.length > 10) {
      value = value.slice(0, 10)
    }

    setInputValue(value)

    // Если введена полная дата (10 символов), пытаемся распарсить
    if (value.length === 10) {
      const parsedDate = parseDdMmYyyy(value)
      if (parsedDate) {
        onDateChange?.(parsedDate)
      }
    }
  }

  // Обработка потери фокуса
  const handleBlur = () => {
    if (inputValue && inputValue.length === 10) {
      const parsedDate = parseDdMmYyyy(inputValue)
      if (parsedDate) {
        // Не вызываем onDateChange повторно, если дата не изменилась
        if (!date || parsedDate.getTime() !== date.getTime()) {
          onDateChange?.(parsedDate)
        }
      } else {
        // Если дата невалидная, возвращаем предыдущую
        setInputValue(date ? format(date, 'dd.MM.yyyy', { locale: ru }) : '')
      }
    } else if (!inputValue) {
      // Если поле пустое, очищаем дату
      onDateChange?.(undefined)
    } else if (inputValue.length < 10) {
      // Если дата неполная, возвращаем предыдущую
      setInputValue(date ? format(date, 'dd.MM.yyyy', { locale: ru }) : '')
    }
  }

  const fromYear = 1900
  const toYear = getCurrentYear() + 10

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <div className="flex items-center gap-2">
        {/* Иконка календаря — открывает popover */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'relative z-10 flex items-center text-sm hover:text-foreground/80 transition-colors',
              'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              date ? 'text-foreground' : 'text-gray-400',
            )}
            disabled={disabled}
            onClick={() => setIsOpen(true)}
            aria-label="Открыть календарь"
          >
            <CalendarIcon className="h-4 w-4 flex-shrink-0" />
          </button>
        </PopoverTrigger>

        {/* Текстовое поле для ввода даты */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          className={cn(
            'text-sm text-foreground bg-transparent border-0 p-0 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !inputValue && 'text-muted-foreground',
          )}
        />
      </div>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(newDate) => {
            if (newDate && isValid(newDate)) {
              setInputValue(format(newDate, 'dd.MM.yyyy', { locale: ru }))
            } else {
              setInputValue('')
            }
            onDateChange?.(newDate)
            setIsOpen(false)
          }}
          captionLayout="dropdown"
          fromYear={fromYear}
          toYear={toYear}
          locale={ru}
        />
      </PopoverContent>
    </Popover>
  )
}
