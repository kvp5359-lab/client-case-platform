/**
 * Шина «черновик треда изменился».
 *
 * Нужна, потому что localStorage не уведомляет об изменениях СВОЮ же вкладку
 * (событие `storage` прилетает только другим вкладкам), а список «Входящие»
 * должен реагировать на появление/исчезновение черновика сразу.
 *
 * Тот же приём, что у inboxBroadcastBus: одна точка публикации, подписчики
 * ре-рендерятся через useSyncExternalStore.
 */

type Listener = () => void

const listeners = new Set<Listener>()

/** Версия «состояния черновиков» — меняется на каждое изменение. */
let version = 0

export function notifyDraftChanged(_threadId?: string): void {
  version += 1
  for (const l of listeners) l()
}

export function subscribeDraftChanges(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDraftVersion(): number {
  return version
}
