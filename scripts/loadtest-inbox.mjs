/**
 * Нагрузочный тест «Входящих» — СТРОГО READ-ONLY.
 *
 * Симулирует N параллельных «активных пользователей Входящих»: каждый в цикле
 * грузит список + агрегаты-счётчики + открывает пару тредов. Поднимает
 * параллельность ступенями (1 → 2 → 4 → 8 → 16…) и меряет, как растёт время
 * ответа и падает пропускная способность. Цель — найти точку, где база
 * перестаёт справляться.
 *
 * ⚠️ Бьёт по БОЕВОЙ базе. Только SELECT/RPC чтения — НИКАКИХ вставок/мутаций
 * (никаких project_messages INSERT, никаких *-send). Есть ранняя остановка:
 * если p95 превышает порог или пойдут ошибки — рамп прекращается.
 *
 * Запуск:
 *   LT_KEY=sb_secret_... node scripts/loadtest-inbox.mjs
 * Опц. env: LT_URL, LT_WS, LT_USER, LT_STEPS, LT_DURATION_MS, LT_P95_STOP_MS, LT_MODE
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.LT_URL ?? 'https://zjatohckcpiqmxkmfxbs.supabase.co'
const KEY = process.env.LT_KEY
const WS = process.env.LT_WS ?? '8a946780-77e9-42cd-a05b-cdb66e53c941'
const USER = process.env.LT_USER ?? '8f5fb8ae-a3e2-48a2-817b-0f22e0d8bfe3'
const STEPS = (process.env.LT_STEPS ?? '1,2,4,8,16').split(',').map((s) => parseInt(s.trim(), 10))
const DURATION_MS = parseInt(process.env.LT_DURATION_MS ?? '8000', 10)
const P95_STOP_MS = parseInt(process.env.LT_P95_STOP_MS ?? '6000', 10)
const ERR_STOP = parseFloat(process.env.LT_ERR_STOP ?? '0.1')
// realistic — список(page)+агрегаты+2 сообщения; heavy — добавляет полный v2-скан
const MODE = process.env.LT_MODE ?? 'realistic'

if (!KEY) {
  console.error('❌ Нет LT_KEY (service_role / sb_secret_...). Запуск: LT_KEY=... node scripts/loadtest-inbox.mjs')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } })

function pct(arr, p) {
  if (!arr.length) return 0
  const a = [...arr].sort((x, y) => x - y)
  return Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))])
}

const now = () => Number(process.hrtime.bigint() / 1000000n)

// латентности по операциям (общие для всех воркеров текущей ступени)
let lat = {}
let errors = 0
let cycles = 0

async function timed(op, fn) {
  const t0 = now()
  const { error } = await fn()
  const dt = now() - t0
  ;(lat[op] ??= []).push(dt)
  if (error) {
    errors++
    if (errors <= 3) console.warn(`  ⚠️ ${op}: ${error.message}`)
  }
  return dt
}

async function oneCycle(threadIds) {
  // 1) список Входящих (первая страница, как в приложении)
  await timed('page', () =>
    sb.rpc('get_inbox_threads_page', { p_workspace_id: WS, p_user_id: USER, p_limit: 50 }),
  )
  // 2) агрегаты-счётчики (грузятся на каждой загрузке + при realtime-обновлении)
  await timed('aggregates', () =>
    sb.rpc('get_inbox_thread_aggregates', { p_workspace_id: WS, p_user_id: USER }),
  )
  // 3) heavy-режим: полный v2-скан (худший случай)
  if (MODE === 'heavy') {
    await timed('v2_full', () =>
      sb.rpc('get_inbox_threads_v2', { p_workspace_id: WS, p_user_id: USER }),
    )
  }
  // 4) открыть пару тредов (чтение сообщений) — READ ONLY
  for (let i = 0; i < 2; i++) {
    const tid = threadIds[Math.floor((cycles + i) % threadIds.length)]
    await timed('messages', () =>
      sb
        .from('project_messages')
        .select('id,content,created_at,sender_role,has_attachments,thread_id')
        .eq('thread_id', tid)
        .order('created_at', { ascending: false })
        .limit(50),
    )
  }
  cycles++
}

async function worker(deadline, threadIds, stop) {
  while (now() < deadline && !stop.flag) {
    try {
      await oneCycle(threadIds)
    } catch (e) {
      errors++
      if (errors <= 3) console.warn('  ⚠️ cycle error:', e?.message ?? e)
    }
  }
}

async function runStep(concurrency, threadIds) {
  lat = {}
  errors = 0
  cycles = 0
  const stop = { flag: false }
  const t0 = now()
  const deadline = t0 + DURATION_MS
  const workers = Array.from({ length: concurrency }, () => worker(deadline, threadIds, stop))
  await Promise.all(workers)
  const elapsed = (now() - t0) / 1000
  const totalReqs = Object.values(lat).reduce((s, a) => s + a.length, 0)
  const cyclePct = {
    p50: pct(lat.page ?? [], 50),
    p95: pct([...(lat.page ?? []), ...(lat.aggregates ?? []), ...(lat.v2_full ?? [])], 95),
  }
  const errRate = totalReqs ? errors / totalReqs : 0
  console.log(
    `\n━━ concurrency=${concurrency} (${DURATION_MS / 1000}s) ━━` +
      `\n  циклов: ${cycles}  |  пропускная: ${(cycles / elapsed).toFixed(1)} циклов/с  |  запросов: ${totalReqs}  |  ошибок: ${errors} (${(errRate * 100).toFixed(1)}%)`,
  )
  const rows = Object.entries(lat).map(([op, a]) => ({
    операция: op,
    'n': a.length,
    'p50, мс': pct(a, 50),
    'p95, мс': pct(a, 95),
    'p99, мс': pct(a, 99),
    'max, мс': pct(a, 100),
  }))
  console.table(rows)
  return { concurrency, cycles, throughput: cycles / elapsed, p95: cyclePct.p95, errRate }
}

async function main() {
  console.log(`▶️ Нагрузочный тест Входящих | mode=${MODE} | ws=${WS.slice(0, 8)} | шаги=${STEPS.join(',')}`)
  const { data: threads, error } = await sb
    .from('project_threads')
    .select('id')
    .eq('workspace_id', WS)
    .eq('is_deleted', false)
    .limit(100)
  if (error || !threads?.length) {
    console.error('❌ Не удалось получить thread_ids:', error?.message)
    process.exit(1)
  }
  const threadIds = threads.map((t) => t.id)
  console.log(`   тредов для чтения: ${threadIds.length}\n`)

  const summary = []
  for (const c of STEPS) {
    const r = await runStep(c, threadIds)
    summary.push(r)
    if (r.p95 > P95_STOP_MS) {
      console.log(`\n🛑 Ранняя остановка: p95 ${r.p95}мс > порога ${P95_STOP_MS}мс`)
      break
    }
    if (r.errRate > ERR_STOP) {
      console.log(`\n🛑 Ранняя остановка: ошибок ${(r.errRate * 100).toFixed(1)}% > ${ERR_STOP * 100}%`)
      break
    }
    await new Promise((res) => setTimeout(res, 1500)) // пауза между ступенями
  }

  console.log('\n\n═══ ИТОГ: кривая нагрузки ═══')
  console.table(
    summary.map((s) => ({
      'параллельно': s.concurrency,
      'циклов/с': s.throughput.toFixed(1),
      'p95 тяжёлых, мс': s.p95,
      'ошибок %': (s.errRate * 100).toFixed(1),
    })),
  )
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('Фатальная ошибка:', e)
    process.exit(1)
  },
)
