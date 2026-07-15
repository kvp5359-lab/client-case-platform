#!/usr/bin/env node
/**
 * Поведенческие self-тесты критичных функций БД.
 *
 * Каждый тест — RPC, которая создаёт fixture, проверяет сценарии и ОТКАТЫВАЕТ
 * fixture (вложенный savepoint) → в базе не остаётся следов, наружу (в каналы)
 * ничего не уходит. Возвращает 'PASS' либо текст первого проваленного ассерта.
 *
 * Валит CI (exit 1), если хоть один сломан.
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/check-db-selftests.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SELFTESTS = [
  {
    rpc: '_selftest_recompute_unread',
    title: 'recompute_thread_unread_for — счётчики непрочитанного',
    // тело: 20260712180000_selftest_recompute_unread.sql
  },
  {
    rpc: '_selftest_thread_template_folding',
    title: 'resolve_thread_template_binding — применение шаблона треда',
    // тело: 20260715180000_selftest_thread_template_folding.sql
  },
]

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

let failed = false
for (const { rpc, title } of SELFTESTS) {
  const { data, error } = await supabase.rpc(rpc)
  if (error) {
    console.error(`✗ RPC ${rpc} недоступна: ${error.message}`)
    process.exit(2)
  }
  if (data === 'PASS') {
    console.log(`✓ ${title}`)
  } else if (typeof data === 'string' && data.startsWith('SKIP')) {
    console.log(`— ${title}: ${data}`)
  } else {
    console.error(`✗ ${title} СЛОМАНА: ${data}`)
    failed = true
  }
}

process.exit(failed ? 1 : 0)
