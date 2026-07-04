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

// Клиент под смок-бота (для вложений MTProto/email фронт зовёт edge как юзер).
// Нужны env SUPABASE_ANON_KEY + SMOKE_BOT_PASSWORD. Без них файлы MTProto/email
// пропускаются (текст/ответ и файлы TG/WA работают и без бота).
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
let botClient = null
if (anon && process.env.SMOKE_BOT_PASSWORD) {
  const bc = createClient(url, anon, { auth: { persistSession: false } })
  const { error } = await bc.auth.signInWithPassword({
    email: process.env.SMOKE_BOT_EMAIL || 'smoke-bot@clientcase.internal',
    password: process.env.SMOKE_BOT_PASSWORD,
  })
  if (error) console.log(`⚠️  логин смок-бота не удался (${error.message}) — файлы MTProto/email пропущу`)
  else botClient = bc
}

// Мелкие тест-файлы (генерятся в памяти, в репо не коммитятся).
const PNG_128 = makePng(128, 128)                                   // валидный 128x128 PNG
const TXT = Buffer.from('ClientCase smoke-test document ' + new Date().toISOString() + '\n', 'utf8')

// Через force-dispatch вложения реально уходят у TG-группы и Wazzup; у MTProto/
// email их шлёт edge, вызываемый как юзер (смок-бот).
const DISPATCH_CHANNELS = new Set(['telegram_group', 'wazzup'])
const EDGE_BY_CHANNEL = { telegram_mtproto: 'telegram-mtproto-send', email: 'email-internal-send' }

// Загружает файлы в бакет `files` и отправляет как одно сообщение с вложениями.
async function sendFiles(threadId, channel, files, withText) {
  const useDispatch = DISPATCH_CHANNELS.has(channel)
  if (!useDispatch && !botClient) throw new Error('нужен смок-бот (SMOKE_BOT_PASSWORD)')
  const msgId = randomUUID()
  const uploaded = []
  for (const f of files) {
    const path = `smoke/${msgId}/${f.name}`
    const { error } = await supabase.storage.from('files').upload(path, f.buf, { contentType: f.mime, upsert: true })
    if (error) throw new Error('upload: ' + error.message)
    uploaded.push({ name: f.name, size: f.buf.length, mime: f.mime, path })
  }
  const { error } = await supabase.rpc('smoke_send_file', {
    p_thread_id: threadId, p_message_id: msgId, p_with_text: withText, p_files: uploaded, p_dispatch: useDispatch,
  })
  if (error) throw new Error('rpc: ' + error.message)
  if (!useDispatch) {
    const fn = EDGE_BY_CHANNEL[channel]
    if (!fn) throw new Error('нет edge для канала ' + channel)
    const { error: ie } = await botClient.functions.invoke(fn, { body: { message_id: msgId } })
    if (ie) throw new Error(`invoke ${fn}: ${ie.message}`)
  }
  return msgId
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

const COMBOS = [
  { key: 'text', run: async (t) => (await supabase.rpc('smoke_send_test', { p_thread_id: t.thread_id, p_label: 'text' })).data },
  { key: 'reply', run: async (t, ctx) => {
      if (!ctx.lastTextId) throw new Error('нет предыдущего текста для ответа')
      return (await supabase.rpc('smoke_send_test', { p_thread_id: t.thread_id, p_reply_to: ctx.lastTextId, p_label: 'reply' })).data
    } },
  { key: 'file',      files: true, run: (t) => sendFiles(t.thread_id, t.channel, [IMG], false) },
  { key: 'file+text', files: true, run: (t) => sendFiles(t.thread_id, t.channel, [IMG], true) },
  { key: 'album',     files: true, run: (t) => sendFiles(t.thread_id, t.channel, [IMG, DOC], false) },
]

const results = []
for (const t of threads) {
  console.log(`\n=== ${t.channel} — ${t.note ?? t.thread_id} ===`)
  const ctx = {}
  for (const combo of COMBOS) {
    if (combo.files && !DISPATCH_CHANNELS.has(t.channel) && !botClient) {
      console.log(`  ${combo.key} … n/a (нужен смок-бот: SMOKE_BOT_PASSWORD)`)
      continue
    }
    process.stdout.write(`  ${combo.key} … `)
    try {
      const msgId = await combo.run(t, ctx)
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
