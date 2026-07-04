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
import { randomUUID } from 'node:crypto'
import zlib from 'node:zlib'

// Генерирует ВАЛИДНЫЙ PNG WxH сплошного цвета (Telegram sendPhoto строг к формату).
function makePng(w, h, rgb = [80, 140, 220]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0  // 8bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgb)))])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Мелкие тест-файлы (генерятся в памяти, в репо не коммитятся).
const PNG_128 = makePng(128, 128)                                   // валидный 128x128 PNG
const TXT = Buffer.from('ClientCase smoke-test document ' + new Date().toISOString() + '\n', 'utf8')

// Загружает файлы в бакет `files` и отправляет как одно сообщение с вложениями.
async function sendFiles(threadId, files, withText) {
  const msgId = randomUUID()
  const uploaded = []
  for (const f of files) {
    const path = `smoke/${msgId}/${f.name}`
    const { error } = await supabase.storage.from('files').upload(path, f.buf, { contentType: f.mime, upsert: true })
    if (error) throw new Error('upload: ' + error.message)
    uploaded.push({ name: f.name, size: f.buf.length, mime: f.mime, path })
  }
  const { data, error } = await supabase.rpc('smoke_send_file', {
    p_thread_id: threadId, p_message_id: msgId, p_with_text: withText, p_files: uploaded,
  })
  if (error) throw new Error('rpc: ' + error.message)
  return data
}
const IMG = { name: 'smoke.png', mime: 'image/png', buf: PNG_128 }
const DOC = { name: 'smoke.txt', mime: 'text/plain', buf: TXT }

// Ждём финальный статус отправки (до ~30с).
async function waitSent(msgId) {
  for (let i = 0; i < 30; i++) {   // до ~60с (вложения email/крупные — медленнее)
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

// Файловые комбинации идут через dispatch(force) — так вложения реально уходят
// у TG-группы и Wazzup. У MTProto/email фронт шлёт вложения ПРЯМЫМ invoke
// (`*-send` с attachments_only), который тут не воспроизводится → для них
// файловые шаги помечаются n/a (отдельная фаза 2b). Текст/ответ — везде.
const FILE_CHANNELS = new Set(['telegram_group', 'wazzup'])
const COMBOS = [
  { key: 'text', run: async (tid) => (await supabase.rpc('smoke_send_test', { p_thread_id: tid, p_label: 'text' })).data },
  { key: 'reply', run: async (tid, ctx) => {
      if (!ctx.lastTextId) throw new Error('нет предыдущего текста для ответа')
      return (await supabase.rpc('smoke_send_test', { p_thread_id: tid, p_reply_to: ctx.lastTextId, p_label: 'reply' })).data
    } },
  { key: 'file',      files: true, run: (tid) => sendFiles(tid, [IMG], false) },
  { key: 'file+text', files: true, run: (tid) => sendFiles(tid, [IMG], true) },
  { key: 'album',     files: true, run: (tid) => sendFiles(tid, [IMG, DOC], false) },
]

const results = []
for (const t of threads) {
  console.log(`\n=== ${t.channel} — ${t.note ?? t.thread_id} ===`)
  const ctx = {}
  for (const combo of COMBOS) {
    if (combo.files && !FILE_CHANNELS.has(t.channel)) {
      console.log(`  ${combo.key} … n/a (файлы через прямой invoke — фаза 2b)`)
      continue
    }
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
