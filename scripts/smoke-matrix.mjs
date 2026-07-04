#!/usr/bin/env node
/**
 * Матрица-раннер смок-тестов каналов. По каждому треду из allowlist
 * (smoke_test_threads) прогоняет комбинации исходящих и проверяет доставку
 * (send_status='sent'). НИЧЕГО не чистит — тест-чаты на то и тестовые.
 *
 * ⚠️ Отправляет РЕАЛЬНЫЕ сообщения ТОЛЬКО в треды из allowlist (защита в RPC
 * smoke_send_test). Требует --confirm.
 *
 * Реализованные комбинации (фаза 1, через вставку + триггер):
 *   - text        текст
 *   - reply       ответ-цитата на предыдущий текст
 * Планируемые (фаза 2, нужна машинерия файлов/эдж-инвоки, удаление — C3):
 *   - file, file+text, album, reaction, edit, delete
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/smoke-matrix.mjs --confirm
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Ждём финальный статус отправки (до ~30с).
async function waitSent(msgId) {
  for (let i = 0; i < 15; i++) {
    await sleep(2000)
    const { data } = await supabase.from('project_messages').select('send_status').eq('id', msgId).single()
    if (data?.send_status === 'sent' || data?.send_status === 'failed') return data.send_status
  }
  return 'timeout'
}

const { data: threads, error } = await supabase.from('smoke_test_threads').select('thread_id, channel, note')
if (error) { console.error('✗ allowlist:', error.message); process.exit(2) }
if (!threads?.length) { console.log('ℹ️  Allowlist пуст — нечего тестировать.'); process.exit(0) }

if (!process.argv.includes('--confirm')) {
  console.log(`Будут отправлены РЕАЛЬНЫЕ сообщения в ${threads.length} тред(ов) из allowlist. Запусти с --confirm.`)
  threads.forEach((t) => console.log(`  • ${t.channel} — ${t.note ?? t.thread_id}`))
  process.exit(0)
}

// Комбинации фазы 1. Каждая возвращает msgId (или бросает).
const COMBOS = [
  { key: 'text', run: async (tid) => (await supabase.rpc('smoke_send_test', { p_thread_id: tid, p_label: 'text' })).data },
  { key: 'reply', run: async (tid, ctx) => {
      if (!ctx.lastTextId) throw new Error('нет предыдущего текста для ответа')
      return (await supabase.rpc('smoke_send_test', { p_thread_id: tid, p_reply_to: ctx.lastTextId, p_label: 'reply' })).data
    } },
]

const results = []
for (const t of threads) {
  console.log(`\n=== ${t.channel} — ${t.note ?? t.thread_id} ===`)
  const ctx = {}
  for (const combo of COMBOS) {
    process.stdout.write(`  ${combo.key} … `)
    try {
      const msgId = await combo.run(t.thread_id, ctx)
      if (!msgId) throw new Error('нет msgId')
      if (combo.key === 'text') ctx.lastTextId = msgId
      const status = await waitSent(msgId)
      console.log(status === 'sent' ? '✓' : `✗ ${status}`)
      results.push({ channel: t.channel, combo: combo.key, ok: status === 'sent' })
    } catch (e) {
      console.log(`✗ ${e.message}`)
      results.push({ channel: t.channel, combo: combo.key, ok: false })
    }
  }
}

const bad = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(40)}\nИтог: ${results.length - bad.length}/${results.length} ✓`)
if (bad.length) console.log('Провалы: ' + bad.map((r) => `${r.channel}/${r.combo}`).join(', '))
process.exit(bad.length ? 1 : 0)
