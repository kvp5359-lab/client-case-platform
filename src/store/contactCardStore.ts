"use client"

/**
 * Глобальный стор для карточки контакта.
 * Mount-ится один раз в WorkspaceLayout через <GlobalContactCardDialog />.
 * Открывать карточку из любого места: useContactCardStore.getState().open(participantId).
 */

import { create } from 'zustand'

interface ContactCardStore {
  participantId: string | null
  open: (participantId: string) => void
  close: () => void
}

export const useContactCardStore = create<ContactCardStore>((set) => ({
  participantId: null,
  open: (participantId) => set({ participantId }),
  close: () => set({ participantId: null }),
}))
