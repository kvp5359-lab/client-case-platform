"use client"

/**
 * Глобальный стор для карточки контакта.
 * Mount-ится один раз в WorkspaceLayout через <GlobalContactCardDialog />.
 * Открывать карточку из любого места: useContactCardStore.getState().open(participantId).
 */

import { create } from 'zustand'

type ContactCardStore = {
  participantId: string | null
  /** Открыть карточку сразу в режиме полного редактирования участника. */
  fullEdit: boolean
  open: (participantId: string, fullEdit?: boolean) => void
  close: () => void
}

export const useContactCardStore = create<ContactCardStore>((set) => ({
  participantId: null,
  fullEdit: false,
  open: (participantId, fullEdit = false) => set({ participantId, fullEdit }),
  close: () => set({ participantId: null, fullEdit: false }),
}))
