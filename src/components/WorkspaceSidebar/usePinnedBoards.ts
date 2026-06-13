"use client"

/**
 * Адаптер для BoardsPage: кнопка «закрепить/открепить» на доске.
 * Тонкая обёртка над общим usePinnedSlots (slotType='board').
 */

import { usePinnedSlots } from './usePinnedSlots'

export function usePinnedBoards(workspaceId: string | undefined) {
  return usePinnedSlots(workspaceId, 'board')
}
