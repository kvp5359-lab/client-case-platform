/**
 * Тонкая обёртка над console для красивого тегирования.
 * Fastify приносит свой pino — а тут используется только в bootstrap-фазе
 * до старта Fastify.
 */

import { config } from "../config.js"

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const
const threshold = LEVELS[config.LOG_LEVEL]

function fmt(level: keyof typeof LEVELS, ...args: unknown[]) {
  if (LEVELS[level] < threshold) return
  const ts = new Date().toISOString()
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
    `[${ts}] [${level.toUpperCase()}]`,
    ...args,
  )
}

export const logger = {
  debug: (...args: unknown[]) => fmt("debug", ...args),
  info: (...args: unknown[]) => fmt("info", ...args),
  warn: (...args: unknown[]) => fmt("warn", ...args),
  error: (...args: unknown[]) => fmt("error", ...args),
}
