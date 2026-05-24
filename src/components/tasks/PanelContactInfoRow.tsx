"use client"

/**
 * PanelContactInfoRow — верхняя строка боковой панели, когда scope-вкладок
 * это контакт (тред без проекта). Показывает имя контакта; клик открывает
 * карточку контакта.
 */

import { useState } from 'react'
import { User, X } from 'lucide-react'
import { useContactParticipant } from '@/hooks/useContactCard'
import { ContactCardDialog } from '@/components/contacts/ContactCardDialog'

type PanelContactInfoRowProps = {
  contactId: string
  workspaceId: string
  onHidePanel?: () => void
}

export function PanelContactInfoRow({ contactId, onHidePanel }: PanelContactInfoRowProps) {
  const { data: contact } = useContactParticipant(contactId)
  const [cardOpen, setCardOpen] = useState(false)

  const name = contact
    ? [contact.name, contact.last_name].filter(Boolean).join(' ')
    : '…'

  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0 bg-gray-100/60 text-xs">
      <User className="w-4 h-4 text-muted-foreground shrink-0" />
      <button
        type="button"
        onClick={() => setCardOpen(true)}
        className="font-medium text-sm truncate min-w-0 shrink hover:text-primary hover:underline transition-colors text-left"
        title="Открыть карточку контакта"
      >
        {name}
      </button>
      <span className="text-muted-foreground/40 shrink-0" aria-hidden>•</span>
      <span className="text-muted-foreground shrink-0">Личный диалог</span>

      <div className="flex-1 min-w-0" />

      {onHidePanel && (
        <button
          type="button"
          onClick={onHidePanel}
          className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white border border-gray-200 transition-all duration-150 hover:scale-110 hover:rotate-90 hover:border-gray-300"
          title="Скрыть панель (вкладки сохранятся)"
          aria-label="Скрыть панель"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <ContactCardDialog
        participantId={contactId}
        open={cardOpen}
        onOpenChange={setCardOpen}
      />
    </div>
  )
}
