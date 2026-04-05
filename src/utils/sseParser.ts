/**
 * Универсальный парсер SSE-потока.
 * Читает ReadableStream, разбирает event/data и вызывает callback для каждого события.
 */

import { logger } from '@/utils/logger'

export interface SSEEvent {
  type: string
  data: unknown
}

/**
 * Парсит SSE-поток и вызывает onEvent для каждого распознанного события.
 * Формат SSE: `event: <type>\ndata: <json>\n\n`
 */
export async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // Z6-13: try-finally гарантирует закрытие reader при ошибке
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop()!

      for (const part of parts) {
        const eventMatch = part.match(/^event: (\w+)\ndata: ([\s\S]+)$/)
        if (!eventMatch) continue

        const [, eventType, data] = eventMatch
        try {
          const parsed = JSON.parse(data)
          onEvent({ type: eventType, data: parsed })
        } catch {
          // Z6-06: логируем вместо молчаливого пропуска
          logger.warn('SSE: malformed JSON for event', eventType, data.slice(0, 200))
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
