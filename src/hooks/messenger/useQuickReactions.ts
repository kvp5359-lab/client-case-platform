import { useSyncExternalStore } from 'react'
import {
  getQuickReactionsSnapshot,
  getServerSnapshot,
  subscribeRecentReactions,
} from '@/utils/messenger/recentReactions'

/** Возвращает 6 эмодзи в порядке «последние использованные → дефолт». */
export function useQuickReactions(): string[] {
  return useSyncExternalStore(
    subscribeRecentReactions,
    getQuickReactionsSnapshot,
    getServerSnapshot,
  )
}
