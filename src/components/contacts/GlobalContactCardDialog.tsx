"use client"

/**
 * Глобальный mount контактной карточки. Подписан на useContactCardStore.
 * Mount-ится один раз в WorkspaceLayout — открывать карточку из любого
 * места можно через `useContactCardStore.getState().open(participantId)`.
 */

import { useContactCardStore } from '@/store/contactCardStore'
import { ContactCardDialog } from './ContactCardDialog'

export function GlobalContactCardDialog() {
  const participantId = useContactCardStore((s) => s.participantId)
  const fullEdit = useContactCardStore((s) => s.fullEdit)
  const close = useContactCardStore((s) => s.close)
  return (
    <ContactCardDialog
      key={participantId ?? 'none'}
      participantId={participantId}
      open={!!participantId}
      initialFullEdit={fullEdit}
      onOpenChange={(v) => {
        if (!v) close()
      }}
    />
  )
}
