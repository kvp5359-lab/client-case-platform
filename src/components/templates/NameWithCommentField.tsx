/**
 * Поле «Название | Комментарий» — два инпута в одной рамке.
 *
 * Название занимает ровно свою ширину, за ним вертикальный разделитель, дальше
 * комментарий на весь остаток. Разделитель едет следом за длиной названия.
 *
 * Комментарий — внутренняя пометка (чем шаблон отличается от одноимённых),
 * клиенту не показывается.
 */

import { AutoSizeInput } from '@/components/ui/auto-size-input'
import { cn } from '@/lib/utils'

/** Дальше названию расти некуда: иначе комментарий схлопнется в ноль. */
const NAME_MAX_WIDTH = 'max-w-[60%]'

type NameWithCommentFieldProps = {
  name: string
  comment: string
  onNameChange: (value: string) => void
  onCommentChange: (value: string) => void
  namePlaceholder?: string
  commentPlaceholder?: string
  nameId?: string
  required?: boolean
  autoFocus?: boolean
}

export function NameWithCommentField({
  name,
  comment,
  onNameChange,
  onCommentChange,
  namePlaceholder = 'Название папки',
  commentPlaceholder = 'Комментарий — чем отличается от одноимённых',
  nameId,
  required,
  autoFocus,
}: NameWithCommentFieldProps) {
  return (
    <div
      className={cn(
        'flex h-11 w-full items-center rounded-md border border-input bg-transparent px-3 py-1 shadow-sm transition-colors',
        'focus-within:outline-none focus-within:ring-1 focus-within:ring-ring',
      )}
    >
      <AutoSizeInput
        id={nameId}
        value={name}
        onChange={onNameChange}
        measureFallback={namePlaceholder}
        placeholder={namePlaceholder}
        required={required}
        autoFocus={autoFocus}
        className="text-lg font-semibold"
        inputClassName="placeholder:font-normal placeholder:text-muted-foreground/40"
        containerClassName={cn('shrink-0', NAME_MAX_WIDTH)}
      />

      <span className="mx-2 h-5 w-px shrink-0 bg-border" aria-hidden />

      <input
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder={commentPlaceholder}
        aria-label="Комментарий (внутренняя пометка, клиенту не показывается)"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  )
}
