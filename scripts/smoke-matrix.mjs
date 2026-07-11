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

// Воркспейс треда (кэш) — путь файла ОБЯЗАН начинаться с UUID воркспейса,
// иначе storage-RLS/брокер R2 не пустят к нему на чтение (первая папка =
// workspace_id), и картинка в чате покажется битым квадратом.
const wsCache = new Map()
async function workspaceOfThread(threadId) {
  if (wsCache.has(threadId)) return wsCache.get(threadId)
  const { data, error } = await supabase.from('project_threads').select('workspace_id').eq('id', threadId).single()
  if (error || !data?.workspace_id) throw new Error('workspace_id треда: ' + (error?.message ?? 'нет'))
  wsCache.set(threadId, data.workspace_id)
  return data.workspace_id
}

// Загружает файлы в бакет `files` и отправляет как одно сообщение с вложениями.
async function sendFiles(threadId, channel, files, withText) {
  const useDispatch = DISPATCH_CHANNELS.has(channel)
  if (!useDispatch && !botClient) throw new Error('нужен смок-бот (SMOKE_BOT_PASSWORD)')
  const ws = await workspaceOfThread(threadId)
  const msgId = randomUUID()
  const uploaded = []
  for (const f of files) {
    const path = `${ws}/smoke/${msgId}/${f.name}`
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

async function sendAndWait(threadId, label, replyTo) {
  const { data, error } = await supabase.rpc('smoke_send_test', { p_thread_id: threadId, p_label: label, p_reply_to: replyTo ?? null })
  if (error) throw new Error('rpc: ' + error.message)
  const st = await waitSent(data); if (st !== 'sent') throw new Error(st)
  return data
}
async function extIds(msgId) {
  const { data } = await supabase.from('project_messages')
    .select('telegram_message_id, telegram_message_ids, telegram_chat_id, wazzup_message_id').eq('id', msgId).single()
  const m = data || {}
  const tgIds = m.telegram_message_ids?.length ? m.telegram_message_ids : (m.telegram_message_id != null ? [m.telegram_message_id] : [])
  return { ...m, tgIds }
}
// Применимость комбо по каналу. Смок шлёт/действует на СВОИ сообщения, поэтому
// некоторые операции недоступны по природе канала (не баг):
//  - MTProto не даёт реагировать на СВОЁ сообщение → реакция только Wazzup;
//  - WhatsApp/Wazzup ограничивает удаление своего только что отправленного → удаление TG/MTProto;
//  - правка нативно только у Telegram-группы (Wazzup/email не редактируются).
const REACT_CH = new Set(['wazzup'])
const EDIT_CH = new Set(['telegram_group'])
const DELETE_CH = new Set(['telegram_group', 'telegram_mtproto'])
const GATES = {
  files: (t) => DISPATCH_CHANNELS.has(t.channel) || !!botClient,
  react: (t) => !!botClient && REACT_CH.has(t.channel),
  edit: (t) => !!botClient && EDIT_CH.has(t.channel),
  del: (t) => !!botClient && DELETE_CH.has(t.channel),
}

const COMBOS = [
  { key: 'text', run: async (t, ctx) => { ctx.lastTextId = await sendAndWait(t.thread_id, 'text'); return true } },
  { key: 'reply', run: async (t, ctx) => { if (!ctx.lastTextId) throw new Error('нет текста'); await sendAndWait(t.thread_id, 'reply', ctx.lastTextId); return true } },
  { key: 'file',      gate: 'files', run: async (t) => { const st = await waitSent(await sendFiles(t.thread_id, t.channel, [IMG], false)); if (st !== 'sent') throw new Error(st); return true } },
  { key: 'file+text', gate: 'files', run: async (t) => { const st = await waitSent(await sendFiles(t.thread_id, t.channel, [IMG], true)); if (st !== 'sent') throw new Error(st); return true } },
  { key: 'album',     gate: 'files', run: async (t) => { const st = await waitSent(await sendFiles(t.thread_id, t.channel, [IMG, DOC], false)); if (st !== 'sent') throw new Error(st); return true } },
  { key: 'reaction', gate: 'react', run: async (t) => {
      const id = await sendAndWait(t.thread_id, 'react')
      const fn = t.channel === 'wazzup' ? 'wazzup-send-reaction' : 'telegram-mtproto-react'
      const { data, error } = await botClient.functions.invoke(fn, { body: { message_id: id, emoji: '👍' } })
      if (error) throw new Error(fn + ': ' + error.message)
      if (data?.ok === false) throw new Error(data.reason || 'ok=false'); return true
    } },
  { key: 'edit', gate: 'edit', run: async (t) => {
      const id = await sendAndWait(t.thread_id, 'to-edit'); const m = await extIds(id)
      const { data, error } = await botClient.functions.invoke('telegram-edit-message', {
        body: { message_id: id, content: '🔧 Смок [edited] — можно игнорировать', sender_name: 'Smoke Bot', sender_role: 'Владелец', telegram_chat_id: m.telegram_chat_id, telegram_message_id: m.telegram_message_id } })
      if (error) throw new Error('edit: ' + error.message)
      if (data?.ok === false) throw new Error(data.reason || 'ok=false'); return true
    } },
  { key: 'delete', gate: 'del', run: async (t) => {
      const id = await sendAndWait(t.thread_id, 'to-delete'); const m = await extIds(id)
      let res
      if (t.channel === 'telegram_group') res = await botClient.functions.invoke('telegram-delete-message', { body: { telegram_chat_id: m.telegram_chat_id, telegram_message_ids: m.tgIds } })
      else if (t.channel === 'telegram_mtproto') res = await botClient.functions.invoke('telegram-mtproto-delete', { body: { message_id: id, telegram_message_ids: m.tgIds } })
      else res = await botClient.functions.invoke('wazzup-delete', { body: { message_id: id, wazzup_message_id: m.wazzup_message_id } })
      if (res.error) throw new Error('delete: ' + res.error.message)
      if (res.data?.ok === false) throw new Error(res.data.reason || 'ok=false'); return true
    } },
]

const results = []
for (const t of threads) {
  console.log(`\n=== ${t.channel} — ${t.note ?? t.thread_id} ===`)
  const ctx = {}
  for (const combo of COMBOS) {
    if (combo.gate && !GATES[combo.gate](t)) { console.log(`  ${combo.key} … n/a`); continue }
    process.stdout.write(`  ${combo.key} … `)
    try {
      await combo.run(t, ctx)
      console.log('✓'); results.push({ channel: t.channel, combo: combo.key, ok: true })
    } catch (e) {
      console.log(`✗ ${e.message}`); results.push({ channel: t.channel, combo: combo.key, ok: false })
    }
  }
}

const bad = results.filter((r) => !r.ok)
console.log(`\n${'='.repeat(40)}\nИтог: ${results.length - bad.length}/${results.length} ✓`)
if (bad.length) console.log('Провалы: ' + bad.map((r) => `${r.channel}/${r.combo}`).join(', '))
process.exit(bad.length ? 1 : 0)
