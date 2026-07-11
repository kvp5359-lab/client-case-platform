#!/usr/bin/env node
/**
 * Инкрементальный бэкап приватных Storage-бакетов Supabase на диск.
 *
 * Зачем: ежедневные бэкапы Supabase + PITR покрывают ТОЛЬКО базу. Файлы
 * (документы, вложения) в Storage при потере проекта не восстановить. Этот
 * скрипт делает off-project копию на диск (напр. VPS), инкрементально —
 * качает только новые/изменённые объекты (сверка по updated_at+size).
 *
 * Без npm-зависимостей (только глобальный fetch + node:fs) — запускается в
 * голом node:22-alpine без установки пакетов.
 *
 * Источник: бакет читается из R2, если он в STORAGE_R2_BUCKETS И заданы R2-ключи
 * (иначе из Supabase Storage, как раньше). После переезда файлов на R2 бэкап
 * ОБЯЗАН читать из R2 — иначе бэкапит пустой/устаревший Supabase-бакет.
 *
 * Env:
 *   SUPABASE_URL                (или NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY   — для чтения приватных бакетов из Supabase
 *   BACKUP_DIR                  — куда складывать (по умолчанию ./storage-backup)
 *   BUCKETS                     — csv, по умолчанию 4 приватных с пользовательскими данными
 *   STORAGE_R2_BUCKETS          — csv бакетов на R2 (или `*`); какие читать из R2
 *   R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY — для R2-бакетов
 *
 * Запуск: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… BACKUP_DIR=/data/backup \
 *           STORAGE_R2_BUCKETS=… R2_ENDPOINT=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
 *           node scripts/backup-storage.mjs
 */

import { mkdir, writeFile, readFile, rename, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { isBucketOnR2, r2Configured, r2List, r2Get } from './lib/r2.mjs'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Нужны env SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
// Бакет читается из R2, если он в STORAGE_R2_BUCKETS И R2-ключи заданы.
// Иначе (или если R2 не настроен) — из Supabase Storage, как раньше.
const useR2 = (bucket) => isBucketOnR2(bucket) && r2Configured()
const BACKUP_DIR = process.env.BACKUP_DIR || join(process.cwd(), 'storage-backup')
const BUCKETS = (process.env.BUCKETS || 'files,document-files,message-attachments,document-templates')
  .split(',').map((s) => s.trim()).filter(Boolean)

const H = { Authorization: `Bearer ${key}`, apikey: key }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')

// Рекурсивный обход бакета через Storage list API (per-prefix, страницами по 100).
async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 100) {
    let res, data
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
      })
      if (res.ok) { data = await res.json(); break }
      if (attempt === 2) throw new Error(`list ${bucket}/${prefix} → HTTP ${res.status}`)
      await sleep(500 * (attempt + 1))
    }
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
      const path = prefix ? `${prefix}${item.name}` : item.name
      // Папка: id/metadata == null → рекурсия. Файл: есть metadata.size.
      if (item.id == null || item.metadata == null) {
        const nested = await listAll(bucket, `${path}/`)
        out.push(...nested)
      } else {
        out.push({ path, size: Number(item.metadata.size ?? 0), updated_at: item.updated_at || item.created_at || '' })
      }
    }
    if (data.length < 100) break
  }
  return out
}

// Единый формат объекта: { path, size, tag }. tag — метка версии для
// инкрементальной сверки: у Supabase updated_at, у R2 — ETag (меняется при
// перезаписи объекта).
async function listObjects(bucket) {
  if (useR2(bucket)) {
    const objs = await r2List(bucket)
    return objs.map((o) => ({ path: o.key, size: o.size, tag: o.etag || o.lastModified || '' }))
  }
  const objs = await listAll(bucket)
  return objs.map((o) => ({ path: o.path, size: o.size, tag: o.updated_at || '' }))
}

async function writeAtomic(dest, buf) {
  await mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.part`
  await writeFile(tmp, buf)
  await rename(tmp, dest) // атомарно: недокачанный файл не подменит хороший
}

async function download(bucket, path, dest) {
  if (useR2(bucket)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buf = await r2Get(bucket, path)
        if (buf == null) throw new Error(`R2 GET ${bucket}/${path} → 404`)
        await writeAtomic(dest, buf)
        return buf.length
      } catch (e) {
        if (attempt === 2) throw e
        await sleep(500 * (attempt + 1))
      }
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${encodePath(path)}`, { headers: H })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      await writeAtomic(dest, buf)
      return buf.length
    }
    if (attempt === 2) throw new Error(`download ${bucket}/${path} → HTTP ${res.status}`)
    await sleep(500 * (attempt + 1))
  }
}

async function loadState() {
  try { return JSON.parse(await readFile(join(BACKUP_DIR, '.backup-state.json'), 'utf8')) }
  catch { return {} }
}
async function saveState(state) {
  await mkdir(BACKUP_DIR, { recursive: true })
  await writeFile(join(BACKUP_DIR, '.backup-state.json'), JSON.stringify(state, null, 0))
}

async function main() {
  const started = new Date().toISOString()
  console.log(`[backup-storage] start ${started} → ${BACKUP_DIR}`)
  const state = await loadState()
  let totalNew = 0, totalBytes = 0, totalSkip = 0, errors = 0

  for (const bucket of BUCKETS) {
    const objects = await listObjects(bucket)
    console.log(`  ${bucket}: ${objects.length} объектов (${useR2(bucket) ? 'R2' : 'Supabase'})`)
    for (const obj of objects) {
      const stateKey = `${bucket}/${obj.path}`
      const prev = state[stateKey]
      const dest = join(BACKUP_DIR, bucket, obj.path)
      // Пропускаем, если версия (tag) + size совпали И файл физически на месте.
      let onDisk = false
      try { onDisk = (await stat(dest)).size === obj.size } catch { /* нет файла */ }
      if (prev && prev.tag === obj.tag && prev.size === obj.size && onDisk) {
        totalSkip++
        continue
      }
      try {
        const bytes = await download(bucket, obj.path, dest)
        state[stateKey] = { tag: obj.tag, size: obj.size }
        totalNew++; totalBytes += bytes ?? 0
      } catch (e) {
        console.error(`  ✗ ${stateKey}: ${e.message}`)
        errors++
      }
    }
  }

  await saveState(state)
  const mb = (totalBytes / 1024 / 1024).toFixed(1)
  console.log(`[backup-storage] done: скачано ${totalNew} (${mb} MB), пропущено ${totalSkip}, ошибок ${errors}`)
  process.exit(errors ? 1 : 0)
}

main().catch((e) => { console.error('[backup-storage] fatal:', e); process.exit(1) })
