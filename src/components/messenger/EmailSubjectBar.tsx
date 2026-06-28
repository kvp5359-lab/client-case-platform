/**
 * Таблетка темы/получателя email-треда — компактный pill в ряду над лентой;
 * по клику открывает поповер с Кому/Темой.
 *
 * `editable` (черновик — письмо ещё не отправлено) → получатель редактируется
 * тем же пикером, что в модалке (`EmailRecipientsField`: бейдж + поиск по
 * контактам), тема — инпутом. Коммит темы по blur/Enter. Отправленное письмо —
 * read-only.
 */

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  EmailRecipientsField,
  type EmailChip,
  type EmailSuggestion,
} from './EmailRecipientsField'

type EmailSubjectBarProps = {
  subject?: string | null
  contactEmail?: string | null
  editable?: boolean
  suggestions?: EmailSuggestion[]
  onSave?: (next: { subject?: string; contactEmail?: string }) => void
  /** 'pill' — таблетка с темой; 'compact' — только иконка. */
  variant?: 'pill' | 'compact'
}

export function EmailSubjectBar({
  subject,
  contactEmail,
  editable = false,
  suggestions = [],
  onSave,
  variant = 'pill',
}: EmailSubjectBarProps) {
  const [subjectVal, setSubjectVal] = useState(subject ?? '')

  // Синхронизация локального поля темы при смене пропсов (другой тред / приход
  // данных после маунта / refetch) — паттерн «adjust state on prop change».
  const [prevSubject, setPrevSubject] = useState(subject)
  if (subject !== prevSubject) {
    setPrevSubject(subject)
    setSubjectVal(subject ?? '')
  }

  if (!editable && !subject && !contactEmail) return null

  const commitSubject = () => {
    if (onSave && subjectVal.trim() !== (subject ?? '').trim()) onSave({ subject: subjectVal })
  }

  // Получатель → один бейдж (отправка письма берёт один адрес). Label берём из
  // подсказок-контактов, если есть.
  const recipientChips: EmailChip[] = contactEmail
    ? [
        {
          email: contactEmail,
          label:
            suggestions.find((s) => s.email.toLowerCase() === contactEmail.toLowerCase())?.label ??
            contactEmail,
        },
      ]
    : []

  return (
    <Popover>
      <PopoverTrigger asChild>
        {variant === 'compact' ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 hover:bg-red-50 transition-colors"
            title={editable ? `Черновик письма: ${subject || contactEmail || ''}` : `Письмо: ${subject || contactEmail || ''}`}
          >
            <Mail className="w-4 h-4 shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 max-w-[280px] rounded-full border border-red-200 bg-red-50/60 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 transition-colors"
            title={editable ? 'Черновик письма' : 'Письмо'}
          >
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium">{subject || contactEmail || 'Письмо'}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{editable ? 'Черновик письма' : 'Письмо'}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground w-12 shrink-0">Кому:</span>
          {editable ? (
            <EmailRecipientsField
              value={recipientChips}
              onChange={(next) => onSave?.({ contactEmail: next[0]?.email ?? '' })}
              suggestions={suggestions}
              singleSelect
              className="flex-1 min-w-0"
            />
          ) : (
            <span className="text-sm font-medium text-red-700 truncate">{contactEmail}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground w-12 shrink-0">Тема:</span>
          {editable ? (
            <input
              value={subjectVal}
              onChange={(e) => setSubjectVal(e.target.value)}
              onBlur={commitSubject}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="тема письма"
              className="flex-1 min-w-0 h-7 px-1.5 text-sm rounded border border-input bg-background font-medium outline-none focus:border-ring"
            />
          ) : (
            <span className="text-sm font-medium text-red-700 truncate">{subject}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
