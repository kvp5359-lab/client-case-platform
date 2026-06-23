/**
 * Полоса над лентой email-треда: тема + получатель.
 * Сворачиваемая (по умолчанию развёрнута — удобно для черновика, где важно
 * видеть кому и с какой темой уйдёт письмо).
 *
 * `editable` (черновик — письмо ещё не отправлено) → получатель редактируется
 * тем же пикером, что в модалке (`EmailRecipientsField`: бейдж + поиск по
 * контактам), тема — инпутом. Коммит темы по blur/Enter.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Mail } from 'lucide-react'
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
}

export function EmailSubjectBar({
  subject,
  contactEmail,
  editable = false,
  suggestions = [],
  onSave,
}: EmailSubjectBarProps) {
  const [open, setOpen] = useState(true)
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
    <div className="border-b bg-red-50/50 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-red-50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Mail className="h-4 w-4 text-red-700 shrink-0" />
        {!open && (
          <span className="text-sm text-red-700 font-medium truncate">
            {subject || contactEmail}
            {subject && contactEmail && (
              <span className="text-muted-foreground font-normal"> · {contactEmail}</span>
            )}
          </span>
        )}
        {open && (
          <span className="text-sm text-muted-foreground">
            {editable ? 'Черновик письма' : 'Письмо'}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-2 pl-9 flex flex-col gap-1.5">
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
        </div>
      )}
    </div>
  )
}
