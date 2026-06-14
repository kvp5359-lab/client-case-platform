/**
 * Персистенс кэша React Query в IndexedDB (подход «как у Notion», но без
 * sync-движка: кэш недавно открытых тредов переживает перезагрузку страницы,
 * чтобы панель открывалась мгновенно и после reload — рисуем из локального
 * снапшота + фоновое обновление, stale-while-revalidate).
 *
 * ⚠️ Безопасность: в снапшот попадают сообщения переписки. Поэтому:
 *  - персистим ТОЛЬКО запросы сообщений (`['messenger','messages',…]`) —
 *    минимальная чувствительная поверхность, остальной кэш не сохраняется;
 *  - ключ снапшота привязан к user_id (`cc-react-query-cache:<uid>`) — другой
 *    пользователь на том же браузере ФИЗИЧЕСКИ не читает чужой снапшот (даже
 *    если предыдущий не разлогинился). Это главный барьер от кросс-юзер утечки;
 *  - при логауте снапшот ОБЯЗАТЕЛЬНО стирается (`clearPersistedQueryCache`) —
 *    defense-in-depth + гигиена (не держим переписку на диске после выхода);
 *  - `BUSTER` инвалидирует старый снапшот при несовместимых изменениях формы
 *    сообщений (поднять версию — старый кэш будет отброшен при восстановлении).
 *
 * IndexedDB (а не localStorage) — потому что данные сообщений объёмные и доступ
 * асинхронный (не блокирует главный поток).
 */

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
import type { Query } from '@tanstack/react-query'

/** Префикс ключа снапшота в IndexedDB (полный ключ — с user_id). */
const IDB_KEY_PREFIX = 'cc-react-query-cache'
const idbKeyFor = (userId: string) => `${IDB_KEY_PREFIX}:${userId}`

/** Версия формата. Поднять при несовместимых изменениях shape сообщений. */
export const PERSIST_BUSTER = 'msgs-v1'

/** Сколько живёт снапшот (24ч) — старее отбрасывается при восстановлении. */
export const PERSIST_MAX_AGE = 24 * 60 * 60_000

/** Персистер на базе idb-keyval, ключ привязан к пользователю. Только в браузере. */
export function createIdbPersister(userId: string) {
  return createAsyncStoragePersister({
    key: idbKeyFor(userId),
    storage: {
      getItem: (key) => get<string>(key),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
    throttleTime: 1000,
  })
}

/**
 * Что сохранять: только успешные запросы сообщений треда. Остальной кэш
 * (списки, права, документы и т.п.) в IndexedDB не пишем — приватность + размер.
 */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false
  const key = query.queryKey
  return Array.isArray(key) && key[0] === 'messenger' && key[1] === 'messages'
}

/** Стереть снапшот пользователя (вызывать при логауте — защита на общем браузере). */
export async function clearPersistedQueryCache(userId: string): Promise<void> {
  try {
    await del(idbKeyFor(userId))
  } catch {
    // idb недоступен/приватный режим — не критично.
  }
}
