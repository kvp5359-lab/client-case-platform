import { REACTIONS } from '@/components/messenger/ReactionPicker'

/**
 * Частые реакции пользователя. Сохраняется в localStorage — привычки
 * формируются на том устройстве, где юзер реально переписывается, поэтому
 * кросс-устройственность не критична и не требует миграций/RPC.
 *
 * Сортировка — по lastUsed (последнее использование сверху). До 6 штук;
 * если меньше — добивается дефолтами из REACTIONS, чтобы ряд всегда был полным.
 */

const STORAGE_KEY = 'cc:recentReactions:v1'
const MAX_QUICK = 6

interface Entry {
  emoji: string
  count: number
  lastUsed: number
}

/** Стабильная ссылка для SSR-снапшота и инициализации. */
const DEFAULT_QUICK: string[] = REACTIONS.slice(0, MAX_QUICK)

function readStorage(): Entry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is Entry =>
        !!e && typeof e.emoji === 'string' && typeof e.lastUsed === 'number',
    )
  } catch {
    return []
  }
}

function writeStorage(entries: Entry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* quota / private mode — не критично */
  }
}

let cachedSnapshot: string[] | null = null
const listeners = new Set<() => void>()

function computeSnapshot(): string[] {
  const entries = readStorage()
  if (entries.length === 0) return DEFAULT_QUICK
  const sorted = [...entries].sort((a, b) => b.lastUsed - a.lastUsed)
  const result: string[] = []
  for (const e of sorted) {
    if (result.length >= MAX_QUICK) break
    if (!result.includes(e.emoji)) result.push(e.emoji)
  }
  for (const e of REACTIONS) {
    if (result.length >= MAX_QUICK) break
    if (!result.includes(e)) result.push(e)
  }
  return result
}

export function getQuickReactionsSnapshot(): string[] {
  if (!cachedSnapshot) cachedSnapshot = computeSnapshot()
  return cachedSnapshot
}

export function getServerSnapshot(): string[] {
  return DEFAULT_QUICK
}

export function subscribeRecentReactions(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Записать использование эмодзи. Вызывать при явном выборе реакции пользователем
 * (quick-ряд или полный пикер), не при снятии существующей реакции.
 */
export function trackReactionUsage(emoji: string): void {
  if (typeof window === 'undefined') return
  const entries = readStorage()
  const existing = entries.find((e) => e.emoji === emoji)
  const now = Date.now()
  if (existing) {
    existing.count += 1
    existing.lastUsed = now
  } else {
    entries.push({ emoji, count: 1, lastUsed: now })
  }
  writeStorage(entries)
  cachedSnapshot = null
  listeners.forEach((fn) => fn())
}
