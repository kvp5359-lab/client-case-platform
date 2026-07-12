import { timingSafeEqual } from "node:crypto"

/**
 * Constant-time сравнение x-internal-secret. Обычный `!==` утекает длину/префикс
 * секрета через тайминг. Паритет с фиксом attachment-proxy токена (ledger
 * 2026-07-11). Разная длина → сразу false (timingSafeEqual бросает на разной
 * длине буферов).
 */
export function safeSecretEqual(got: unknown, expected: string): boolean {
  if (typeof got !== "string" || got.length === 0) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
