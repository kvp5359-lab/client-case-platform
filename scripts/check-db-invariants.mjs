#!/usr/bin/env node
/**
 * Guard известных хрупких инвариантов БД (дополняет db-drift-check.mjs).
 * Читает read-only RPC public._schema_invariants() и валит (exit 1), если:
 *   1. recompute_thread_unread_for потеряла хоть одно правило формулы непрочитанного
 *      (ledger: CREATE OR REPLACE из параллельной сессии молча стирал чужую строку).
 *   2. get_board_filtered_threads по числу out-колонок разошлась с get_workspace_threads
 *      (расхождение уже роняло прод — 2026-06-24, доски/календарь на 400).
 *   3. Появилась НОВАЯ SECURITY DEFINER функция с EXECUTE у PUBLIC/anon вне
 *      whitelist (по умолчанию CREATE FUNCTION выдаёт PUBLIC → потенциальный
 *      обход RLS/IDOR; см. Фаза 1/3 аудита 2026-07-12).
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/check-db-invariants.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await supabase.rpc('_schema_invariants')
if (error) {
  console.error('✗ RPC _schema_invariants недоступна:', error.message)
  process.exit(2)
}

const inv = typeof data === 'string' ? JSON.parse(data) : data
let failed = 0

// 1. Правила формулы непрочитанного
const markers = inv.recompute_markers || {}
const missing = Object.entries(markers).filter(([, v]) => v !== true).map(([k]) => k)
if (missing.length) {
  console.error(`✗ recompute_thread_unread_for потеряла правила: ${missing.join(', ')}`)
  failed++
} else {
  console.log('✓ recompute_thread_unread_for — все правила формулы на месте')
}

// 2. Совпадение колонок связки досок
if (inv.board_out_cols !== inv.workspace_out_cols) {
  console.error(`✗ Колонки разошлись: get_board_filtered_threads=${inv.board_out_cols} ≠ get_workspace_threads=${inv.workspace_out_cols}. Синхронизируй RETURNS TABLE.`)
  failed++
} else {
  console.log(`✓ get_board_filtered_threads == get_workspace_threads (${inv.workspace_out_cols} колонок)`)
}

// 3. Ни одной новой SECURITY DEFINER функции с PUBLIC/anon вне whitelist.
// Whitelist — намеренно публичные функции (резолверы коротких ссылок для
// middleware, гейт регистрации, публичная статья/QA по неугадываемому токену).
// Добавляешь сюда осознанно новую anon-функцию — впиши её ИМЯ и причину.
const ANON_WHITELIST = new Set([
  'consume_platform_invite',   // регистрация по инвайту (гейт на UI)
  'get_shared_article',        // публичная статья по неугадываемому токену
  'get_short_id_by_uuid',      // резолвер коротких ссылок (proxy.ts)
  'get_workspace_slug_by_id',  // резолвер коротких ссылок (proxy.ts)
  'registration_allowed',      // boolean-гейт регистрации
  'resolve_short_id',          // резолвер коротких ссылок (proxy.ts)
  'resolve_workspace_by_host', // резолвер домена воркспейса (proxy.ts)
])
const secdefPublic = inv.secdef_public_or_anon || []
const rogue = secdefPublic.filter((n) => !ANON_WHITELIST.has(n))
if (rogue.length) {
  console.error(`✗ SECURITY DEFINER функции с PUBLIC/anon execute вне whitelist: ${rogue.join(', ')}. Добавь REVOKE ALL … FROM PUBLIC, anon (и явный GRANT), либо впиши в ANON_WHITELIST с обоснованием.`)
  failed++
} else {
  console.log(`✓ SECURITY DEFINER + PUBLIC/anon — только whitelist (${secdefPublic.length})`)
}

if (failed) {
  console.error(`\n⚠️  Нарушено инвариантов: ${failed}.`)
  process.exit(1)
}
console.log('\n✓ Инварианты БД в порядке.')
process.exit(0)
