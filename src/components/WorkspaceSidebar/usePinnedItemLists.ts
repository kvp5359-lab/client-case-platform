"use client"

/**
 * Адаптер для item_lists: кнопка «закрепить/открепить» в сайдбаре.
 * Тонкая обёртка над общим usePinnedSlots (slotType='list').
 */

import { usePinnedSlots } from './usePinnedSlots'

export function usePinnedItemLists(workspaceId: string | undefined) {
  return usePinnedSlots(workspaceId, 'list')
}
