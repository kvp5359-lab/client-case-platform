#!/usr/bin/env node
/**
 * Детектор дрейфа функций repo↔prod.
 *
 * Сравнивает «отпечаток» функций боевой базы (RPC _schema_function_manifest,
 * возвращает имя+сигнатуру+md5 тела) с эталоном supabase/schema/functions-manifest.json.
 * Показывает: добавленные в проде / удалённые / изменённые (тело разошлось).
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db-drift-check.mjs [--strict]
 * По умолчанию печатает отчёт и выходит с кодом 0 (не блокирует). --strict → код 1 при дрейфе.
 *
 * Обновить эталон после осознанного изменения функций:
 *   node scripts/db-drift-check.mjs --update
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, '..', 'supabase', 'schema', 'functions-manifest.json')

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const strict = process.argv.includes('--strict')
const update = process.argv.includes('--update')

const keyOf = (f) => `${f.name}(${f.args})`

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data: live, error } = await supabase.rpc('_schema_function_manifest')
if (error) {
  console.error('✗ RPC _schema_function_manifest недоступна:', error.message)
  process.exit(2)
}
const liveArr = Array.isArray(live) ? live : JSON.parse(live)

if (update) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(liveArr, null, 2) + '\n')
  console.log(`✓ Эталон обновлён: ${liveArr.length} функций → ${MANIFEST_PATH}`)
  process.exit(0)
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`✗ Эталон не найден: ${MANIFEST_PATH}\n  Создай: node scripts/db-drift-check.mjs --update`)
  process.exit(2)
}

const repoArr = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
const repoMap = new Map(repoArr.map((f) => [keyOf(f), f]))
const liveMap = new Map(liveArr.map((f) => [keyOf(f), f]))

const added = [] // в проде, нет в репо
const removed = [] // в репо, нет в проде
const changed = [] // тело разошлось

for (const [k, f] of liveMap) {
  if (!repoMap.has(k)) added.push(k)
  else if (repoMap.get(k).body_md5 !== f.body_md5) changed.push(k)
}
for (const k of repoMap.keys()) if (!liveMap.has(k)) removed.push(k)

const total = added.length + removed.length + changed.length
console.log(`Функций в проде: ${liveArr.length}, в эталоне: ${repoArr.length}`)
if (total === 0) {
  console.log('✓ Дрейфа нет — репозиторий совпадает с боевой базой.')
  process.exit(0)
}

console.log(`\n⚠️  Обнаружен дрейф (${total}):`)
if (changed.length) console.log(`\n  ИЗМЕНЕНЫ в проде (тело ≠ эталон) — ${changed.length}:\n    ${changed.join('\n    ')}`)
if (added.length) console.log(`\n  ТОЛЬКО в проде (нет в репо) — ${added.length}:\n    ${added.join('\n    ')}`)
if (removed.length) console.log(`\n  ТОЛЬКО в репо (нет в проде) — ${removed.length}:\n    ${removed.join('\n    ')}`)
console.log('\n  Разобрать: привести миграции в соответствие с продом, затем\n  node scripts/db-drift-check.mjs --update для обновления эталона.')

process.exit(strict ? 1 : 0)
