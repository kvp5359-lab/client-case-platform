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
 *   4. is_staff_role(text) в БД разошлась со STAFF_ROLES в src/types/permissions.ts
 *      (SQL-зеркало канона ролей; ledger ловил кириллическую опечатку в SQL-роли
 *      вручную — теперь автогард).
 *   5. get_inbox_threads_v2 и get_inbox_threads_v3_for разошлись по именам/порядку
 *      выходных колонок (v3_for — display-путь материализованного инбокса, обязан
 *      повторять форму эталона v2).
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/check-db-invariants.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

// 1b. Backstop'ы роутера исходящих (dispatch_message_to_channels): внутреннее
// (visibility != client) наружу не уходит; вложения при p_force=false пропускаются
// (их шлёт фронт). Зеркало edge-стража check-edge-invariants на уровне БД.
const dispatchMarkers = inv.dispatch_markers || {}
const dispatchMissing = Object.entries(dispatchMarkers).filter(([, v]) => v !== true).map(([k]) => k)
if (dispatchMissing.length) {
  console.error(`✗ dispatch_message_to_channels потеряла backstop: ${dispatchMissing.join(', ')} (внутреннее может утечь клиенту / дубли вложений)`)
  failed++
} else {
  console.log('✓ dispatch_message_to_channels — visibility-backstop и skip-вложений на месте')
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

// 4. is_staff_role (SQL) == STAFF_ROLES (permissions.ts). Ожидаемый набор
// ВЫВОДИМ из TS-источника (единый источник правды), не хардкодим здесь.
function parseRoleObject(src, name) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\}`))
  const map = {}
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/(\w+):\s*'([^']+)'/)
      if (mm) map[mm[1]] = mm[2]
    }
  }
  return map
}
const permSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'types', 'permissions.ts'),
  'utf8',
)
const WS_ROLES = parseRoleObject(permSrc, 'SYSTEM_WORKSPACE_ROLES')
const PROJ_ROLES = parseRoleObject(permSrc, 'SYSTEM_PROJECT_ROLES')
const staffM = permSrc.match(/export const STAFF_ROLES\s*=\s*\[([\s\S]*?)\]/)
const expectedStaff = new Set()
if (staffM) {
  for (const ref of staffM[1].split(',')) {
    const mm = ref.trim().match(/SYSTEM_(WORKSPACE|PROJECT)_ROLES\.(\w+)/)
    if (mm) {
      const val = (mm[1] === 'WORKSPACE' ? WS_ROLES : PROJ_ROLES)[mm[2]]
      if (val) expectedStaff.add(val)
    }
  }
}
const dbStaff = new Set(inv.staff_role_set || [])
if (expectedStaff.size === 0) {
  console.error('✗ Не удалось распарсить STAFF_ROLES из permissions.ts (изменился формат?)')
  failed++
} else if (
  expectedStaff.size !== dbStaff.size ||
  [...expectedStaff].some((r) => !dbStaff.has(r))
) {
  console.error(
    `✗ is_staff_role (БД) разошлась со STAFF_ROLES (permissions.ts): БД=[${[...dbStaff].sort().join(', ')}] ≠ TS=[${[...expectedStaff].sort().join(', ')}]. Синхронизируй SQL-зеркало и TS-канон.`,
  )
  failed++
} else {
  console.log(`✓ is_staff_role == STAFF_ROLES (${[...dbStaff].sort().join(', ')})`)
}

// 5. Форма выходных колонок get_inbox_threads_v2 == get_inbox_threads_v3_for.
if (inv.inbox_v2_v3_cols_match !== true) {
  console.error(
    '✗ get_inbox_threads_v2 и get_inbox_threads_v3_for разошлись по именам/порядку выходных колонок. Материализованный путь инбокса (v3_for) обязан повторять форму v2 — синхронизируй RETURNS TABLE.',
  )
  failed++
} else {
  console.log('✓ get_inbox_threads_v2 форма колонок == get_inbox_threads_v3_for')
}

if (failed) {
  console.error(`\n⚠️  Нарушено инвариантов: ${failed}.`)
  process.exit(1)
}
console.log('\n✓ Инварианты БД в порядке.')
process.exit(0)
