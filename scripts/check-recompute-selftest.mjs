#!/usr/bin/env node
/**
 * Поведенческий self-test самой хрупкой функции мессенджера —
 * recompute_thread_unread_for (счётчики непрочитанного). Зовёт read-only-снаружи
 * RPC public._selftest_recompute_unread(), которая создаёт fixture во ВНУТРЕННЕМ
 * треде (наружу ничего не уходит), проверяет 4 сценария (базовый unread,
 * own-watermark-гонка, mute-архив, priority-пробой mute) и ОТКАТЫВАЕТ весь
 * fixture (savepoint) — в базе следов не остаётся. Возвращает 'PASS' или текст
 * первого проваленного ассерта.
 *
 * Валит CI (exit 1), если формула счётчиков сломана. Тело теста — в миграции
 * 20260712180000_selftest_recompute_unread.sql.
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/check-recompute-selftest.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await supabase.rpc('_selftest_recompute_unread')
if (error) {
  console.error('✗ RPC _selftest_recompute_unread недоступна:', error.message)
  process.exit(2)
}

if (data === 'PASS') {
  console.log('✓ recompute_thread_unread_for — все сценарии счётчиков прошли')
  process.exit(0)
}

console.error(`✗ recompute_thread_unread_for СЛОМАНА: ${data}`)
process.exit(1)
