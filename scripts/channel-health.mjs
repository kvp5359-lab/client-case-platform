#!/usr/bin/env node
/**
 * Read-only здоровье каналов мессенджера. НИЧЕГО не отправляет (безопасно для
 * клиентов) — только читает признаки проблем в БД:
 *  - застрявшие исходящие (send_status='pending' дольше 15 мин)
 *  - незакрытые сбои отправки (message_send_failures)
 *  - просроченный Gmail watch (входящие письма перестают приходить)
 *  - свежесть MTProto-сессий
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/channel-health.mjs [--strict]
 * --strict → код 1 при любой проблеме (для CI-гейта). По умолчанию код 0 (отчёт).
 *
 * ⚠️ Send-смок (реальная отправка тестового сообщения по каналу) сюда НЕ входит —
 * он рискует задеть реальных клиентов. Его проводит владелец вручную на выделенном
 * тест-чате (см. docs/deploy-backlog.md).
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
const strict = process.argv.includes('--strict')
const supabase = createClient(url, key, { auth: { persistSession: false } })

const nowIso = new Date().toISOString()
const cutoff15 = new Date(Date.now() - 15 * 60 * 1000).toISOString()

let problems = 0
const line = (ok, label, detail) => {
  if (!ok) problems++
  console.log(`${ok ? '✓' : '⚠️ '} ${label}${detail ? ` — ${detail}` : ''}`)
}

// 1. Застрявшие исходящие
{
  const { count, error } = await supabase
    .from('project_messages')
    .select('id', { count: 'exact', head: true })
    .eq('send_status', 'pending')
    .lt('created_at', cutoff15)
  if (error) line(false, 'Застрявшие отправки: запрос не удался', error.message)
  else line((count ?? 0) === 0, 'Застрявшие отправки (pending >15 мин)', `${count ?? 0}`)
}

// 2. Незакрытые сбои отправки
{
  const { count, error } = await supabase
    .from('message_send_failures')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)
  if (error) line(false, 'Незакрытые сбои: запрос не удался', error.message)
  else line((count ?? 0) === 0, 'Незакрытые сбои отправки', `${count ?? 0}`)
}

// 3. Просроченный Gmail watch (входящие письма могут не приходить)
{
  const { count, error } = await supabase
    .from('email_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)               // отключённые аккаунты не считаем
    .lt('watch_expires_at', nowIso)
  if (error) line(true, 'Gmail watch: проверка пропущена', error.message)
  else line((count ?? 0) === 0, 'Просроченный Gmail watch (активные)', `${count ?? 0}`)
}

// 4. MTProto-сессии (информационно)
{
  const { count, error } = await supabase
    .from('telegram_mtproto_sessions')
    .select('id', { count: 'exact', head: true })
  if (error) line(true, 'MTProto-сессии: проверка пропущена', error.message)
  else console.log(`ℹ️  MTProto-сессий в базе: ${count ?? 0}`)
}

console.log(problems === 0 ? '\n✓ Каналы здоровы.' : `\n⚠️  Проблем: ${problems}`)
process.exit(strict && problems > 0 ? 1 : 0)
