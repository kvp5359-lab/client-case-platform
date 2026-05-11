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
  const close = useContactCardStore((s) => s.close)
  return (
    <ContactCardDialog
      participantId={participantId}
      open={!!participantId}
      onOpenChange={(v) => {
        if (!v) close()
      }}
    />
  )
}
