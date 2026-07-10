#!/usr/bin/env node
/**
 * Guard известных хрупких инвариантов БД (дополняет db-drift-check.mjs).
 * Читает read-only RPC public._schema_invariants() и валит (exit 1), если:
 *   1. recompute_thread_unread_for потеряла хоть одно правило формулы непрочитанного
 *      (ledger: CREATE OR REPLACE из параллельной сессии молча стирал чужую строку).
 *   2. get_board_filtered_threads по числу out-колонок разошлась с get_workspace_threads
 *      (расхождение уже роняло прод — 2026-06-24, доски/календарь на 400).
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

if (failed) {
  console.error(`\n⚠️  Нарушено инвариантов: ${failed}.`)
  process.exit(1)
}
console.log('\n✓ Инварианты БД в порядке.')
process.exit(0)
