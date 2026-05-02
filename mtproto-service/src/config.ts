/**
 * Конфигурация сервиса из env-переменных.
 *
 * Падаем на старте с понятной ошибкой, если что-то критичное не задано —
 * лучше уронить контейнер сразу, чем работать в полу-настроенном виде
 * и обнаружить это при первой попытке логина.
 */

import { z } from "zod"

const schema = z.object({
  TELEGRAM_API_ID: z
    .string()
    .min(1, "TELEGRAM_API_ID is required (https://my.telegram.org/apps)")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  TELEGRAM_API_HASH: z
    .string()
    .min(1, "TELEGRAM_API_HASH is required (https://my.telegram.org/apps)"),
  MTPROTO_SESSION_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "MTPROTO_SESSION_ENCRYPTION_KEY must be 32 bytes in hex (64 chars). Generate via: openssl rand -hex 32"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  INTERNAL_SECRET: z
    .string()
    .min(16, "INTERNAL_SECRET must be at least 16 chars (use the same value as the rest of the project)"),
  PORT: z
    .string()
    .default("3007")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error("[config] Invalid environment configuration:")
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = parsed.data
