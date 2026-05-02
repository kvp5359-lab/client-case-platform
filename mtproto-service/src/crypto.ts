/**
 * AES-256-GCM шифрование для StringSession от gramjs.
 *
 * Почему GCM, а не CBC: GCM аутентифицированный (включает MAC), нельзя
 * подменить шифротекст незаметно для нас. Для секретов уровня
 * «полный доступ к Telegram-аккаунту сотрудника» это не лишняя
 * предосторожность.
 *
 * Формат хранения (одна строка base64): nonce(12) || ciphertext || tag(16).
 * Это то, что отдаёт Node.js crypto при разделении на части.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { config } from "./config.js"

const KEY = Buffer.from(config.MTPROTO_SESSION_ENCRYPTION_KEY, "hex")
const ALGO = "aes-256-gcm"
const NONCE_LEN = 12 // GCM рекомендация
const TAG_LEN = 16

export function encryptSession(plaintext: string): string {
  const nonce = randomBytes(NONCE_LEN)
  const cipher = createCipheriv(ALGO, KEY, nonce)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([nonce, ct, tag]).toString("base64")
}

export function decryptSession(encoded: string): string {
  const buf = Buffer.from(encoded, "base64")
  if (buf.length < NONCE_LEN + TAG_LEN) {
    throw new Error("Encrypted session is too short to be valid")
  }
  const nonce = buf.subarray(0, NONCE_LEN)
  const tag = buf.subarray(buf.length - TAG_LEN)
  const ct = buf.subarray(NONCE_LEN, buf.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, KEY, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
