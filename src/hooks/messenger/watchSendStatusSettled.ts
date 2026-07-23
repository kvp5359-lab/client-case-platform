/**
 * Догоняющая проверка статуса отправки — страховка от «глухого» realtime.
 *
 * Почему нужна: после отправки onSuccess перечитывает тред, но перечитка
 * стартует РАНЬШЕ, чем канал подтверждает доставку (~0.3с против ~0.6с) → в
 * кэш попадает ещё `pending`. Дальше статус обновляет только realtime-сигнал,
 * а он теряется у долго открытой вкладки (сон ноутбука / реконнект сокета) —
 * бабл висел «Отправляется» до F5, хотя в БД давно `sent` (инцидент
 * 2026-07-23). Здесь — пара отложенных перечиток: если сообщение в кэше всё
 * ещё `pending`, перечитываем; стало финальным — тихо выходим.
 *
 * Дешёвая: без сети, пока реально не залипло; рефетчит только активную
 * query (тред закрыт → при возврате и так будет свежий fetch).
 */

import type { QueryClient } from '@tanstack/react-query'
import { messengerKeys } from '@/hooks/queryKeys'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

// 4с — успевает и медленный markSent; 12с — второй шанс после сетевого чиха.
const RETRY_DELAYS_MS = [4_000, 12_000]

type MessagesCache =
  | { pages: { messages: ProjectMessage[] }[]; pageParams: unknown[] }
  | undefined

export function watchSendStatusSettled(
  queryClient: QueryClient,
  threadId: string,
  messageIds: string[],
): void {
  if (messageIds.length === 0) return
  const key = messengerKeys.messagesByThreadId(threadId)
  const ids = new Set(messageIds)

  const anyStillPending = (): boolean => {
    const data = queryClient.getQueryData(key) as MessagesCache
    if (!data) return false
    for (const page of data.pages) {
      for (const msg of page.messages) {
        if (ids.has(msg.id) && msg.send_status === 'pending') return true
      }
    }
    return false
  }

  for (const delay of RETRY_DELAYS_MS) {
    setTimeout(() => {
      if (!anyStillPending()) return
      void queryClient.refetchQueries({ queryKey: key, type: 'active' })
    }, delay)
  }
}
