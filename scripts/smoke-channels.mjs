#!/usr/bin/env node
/**
 * Смок-тест каналов: отправляет РЕАЛЬНОЕ тестовое сообщение в каждый тред из
 * allowlist `smoke_test_threads` и проверяет, что оно ушло (send_status='sent').
 *
 * ⚠️ ОТПРАВЛЯЕТ НАСТОЯЩИЕ СООБЩЕНИЯ. Слать можно ТОЛЬКО в тестовые чаты, которые
 * владелец вручную добавил в allowlist. Двойная защита:
 *   1) RPC smoke_send_test на сервере отклоняет треды вне allowlist;
 *   2) скрипт требует флаг --confirm и печатает цели перед отправкой.
 *
 * Настройка (один раз):
 *   - создай отдельный тестовый воркспейс/треды на ТЕСТОВЫХ чатах каждого канала;
 *   - добавь их в allowlist:
 *     INSERT INTO smoke_test_threads (thread_id, channel, note) VALUES ('<uuid>','telegram_group','тест');
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/smoke-channels.mjs --confirm
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { data: threads, error } = await supabase
  .from('smoke_test_threads')
  .select('thread_id, channel, note')
if (error) { console.error('✗ Не читается allowlist:', error.message); process.exit(2) }

if (!threads || threads.length === 0) {
  console.log('ℹ️  Allowlist смок-теста пуст. Добавь ТЕСТОВЫЕ треды в smoke_test_threads')
  console.log('    (только тестовые чаты, НИКОГДА клиентские). Смок пропущен.')
  process.exit(0)
}

console.log(`Цели смок-теста (${threads.length}):`)
for (const t of threads) console.log(`  • ${t.channel} — ${t.thread_id}${t.note ? ` (${t.note})` : ''}`)

if (!process.argv.includes('--confirm')) {
  console.log('\n⚠️  Будут отправлены РЕАЛЬНЫЕ сообщения в перечисленные треды.')
  console.log('    Убедись, что это тестовые чаты, и запусти с флагом --confirm.')
  process.exit(0)
}

let ok = 0, bad = 0
for (const t of threads) {
  process.stdout.write(`→ ${t.channel} … `)
  let msgId
  try {
    const { data, error: e } = await supabase.rpc('smoke_send_test', { p_thread_id: t.thread_id })
    if (e) throw e
    msgId = data
  } catch (e) {
    console.log(`✗ отправка отклонена: ${e.message}`); bad++; continue
  }
  // Опрос статуса доставки (до ~30с).
  let status = 'pending'
  for (let i = 0; i < 15; i++) {
    await sleep(2000)
    const { data: m } = await supabase
      .from('project_messages').select('send_status').eq('id', msgId).single()
    status = m?.send_status ?? status
    if (status === 'sent' || status === 'failed') break
  }
  if (status === 'sent') { console.log('✓ доставлено'); ok++ }
  else { console.log(`✗ ${status}`); bad++ }
  // Не чистим: тест-чаты на то и тестовые — сообщения остаются как история прогонов.
}

console.log(`\nИтог: доставлено ${ok}, проблем ${bad}`)
process.exit(bad > 0 ? 1 : 0)
