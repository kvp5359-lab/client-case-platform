#!/usr/bin/env node
/**
 * Детектор дрейфа схемы repo↔prod: функции + триггеры + политики RLS.
 *
 * Сравнивает «отпечаток» боевой базы (RPC _schema_manifest, хеши — не тела)
 * с эталоном supabase/schema/schema-manifest.json. Показывает по каждой
 * категории: добавленное в проде / удалённое / изменённое (тело разошлось).
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db-drift-check.mjs [--strict]
 * По умолчанию отчёт + код 0 (не блокирует). --strict → код 1 при дрейфе.
 * Обновить эталон после осознанного изменения схемы: node scripts/db-drift-check.mjs --update
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, '..', 'supabase', 'schema', 'schema-manifest.json')

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const strict = process.argv.includes('--strict')
const update = process.argv.includes('--update')

// Как строить ключ и брать хеш для каждой категории.
const CATS = {
  functions: { key: (f) => `${f.name}(${f.args})`, hash: (f) => f.body_md5, label: 'Функции' },
  triggers:  { key: (t) => `${t.table_name}.${t.name}`, hash: (t) => t.def_md5, label: 'Триггеры' },
  policies:  { key: (p) => `${p.table_name}.${p.name}`, hash: (p) => p.def_md5, label: 'Политики RLS' },
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data: live, error } = await supabase.rpc('_schema_manifest')
if (error) {
  console.error('✗ RPC _schema_manifest недоступна:', error.message)
  process.exit(2)
}
const liveObj = typeof live === 'string' ? JSON.parse(live) : live

if (update) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(liveObj, null, 2) + '\n')
  const counts = Object.keys(CATS).map((c) => `${c}: ${(liveObj[c] || []).length}`).join(', ')
  console.log(`✓ Эталон обновлён (${counts}) → ${MANIFEST_PATH}`)
  process.exit(0)
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`✗ Эталон не найден: ${MANIFEST_PATH}\n  Создай: node scripts/db-drift-check.mjs --update`)
  process.exit(2)
}
const repoObj = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

let totalDrift = 0
for (const [cat, def] of Object.entries(CATS)) {
  const liveArr = liveObj[cat] || []
  const repoArr = repoObj[cat] || []
  const repoMap = new Map(repoArr.map((x) => [def.key(x), def.hash(x)]))
  const liveMap = new Map(liveArr.map((x) => [def.key(x), def.hash(x)]))
  const added = [], removed = [], changed = []
  for (const [k, h] of liveMap) {
    if (!repoMap.has(k)) added.push(k)
    else if (repoMap.get(k) !== h) changed.push(k)
  }
  for (const k of repoMap.keys()) if (!liveMap.has(k)) removed.push(k)
  const n = added.length + removed.length + changed.length
  totalDrift += n
  const status = n === 0 ? '✓' : '⚠️ '
  console.log(`${status} ${def.label}: прод ${liveArr.length}, эталон ${repoArr.length}` +
    (n ? ` — дрейф ${n} (изм:${changed.length} только-прод:${added.length} только-репо:${removed.length})` : ''))
  if (changed.length) console.log(`     ИЗМЕНЕНЫ: ${changed.join(', ')}`)
  if (added.length) console.log(`     ТОЛЬКО В ПРОДЕ: ${added.join(', ')}`)
  if (removed.length) console.log(`     ТОЛЬКО В РЕПО: ${removed.join(', ')}`)
}

if (totalDrift === 0) {
  console.log('\n✓ Дрейфа нет — схема репозитория совпадает с боевой базой.')
  process.exit(0)
}
console.log(`\n⚠️  Всего дрейф: ${totalDrift}. Привести миграции к проду, затем --update.`)
process.exit(strict ? 1 : 0)
