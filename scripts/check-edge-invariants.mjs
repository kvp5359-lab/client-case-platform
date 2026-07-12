#!/usr/bin/env node
/**
 * Гард инвариантов edge-функций отправки (статический, без БД/сети).
 * Валит (exit 1), если хоть одна функция внешней доставки потеряла
 * visibility-backstop — проверку «внутреннее (team/self) сообщение НЕ уходит
 * клиенту». Это единственная защита от утечки на уровне канала (инциденты
 * 2026-07-08 и дыра business/edit, закрытая 2026-07-12). Держать в CI Ops Checks.
 *
 * Запуск: node scripts/check-edge-invariants.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions')

// Функции, которые доставляют сообщение во внешний канал → ОБЯЗАНЫ гейтить
// visibility перед доставкой. При добавлении нового *-send канала — впиши сюда.
const MUST_GATE = [
  'telegram-send-message',
  'telegram-business-send',
  'telegram-mtproto-send',
  'wazzup-send',
  'email-internal-send',
  'telegram-edit-message',
]

// Признак backstop'а: сравнение visibility с 'client'. Достаточно грубого
// совпадения — важно, что проверка физически присутствует в коде.
const GATE_RE = /visibility[^\n]*!==?\s*["']client["']|["']client["']\s*!==?[^\n]*visibility/

let failed = 0
for (const fn of MUST_GATE) {
  const path = join(FN_DIR, fn, 'index.ts')
  if (!existsSync(path)) { console.error(`✗ ${fn}: index.ts не найден`); failed++; continue }
  const src = readFileSync(path, 'utf8')
  if (!GATE_RE.test(src)) {
    console.error(`✗ ${fn}: НЕТ visibility-backstop (внутреннее может утечь клиенту). Добавь проверку visibility !== 'client' перед доставкой.`)
    failed++
  } else {
    console.log(`✓ ${fn} — visibility-backstop на месте`)
  }
}

if (failed) {
  console.error(`\n⚠️  Edge-инвариантов нарушено: ${failed}.`)
  process.exit(1)
}
console.log('\n✓ Все send/edit-функции гейтят visibility.')
process.exit(0)
