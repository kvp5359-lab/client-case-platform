/**
 * Гард на резолв «где физически лежит вложение».
 *
 * Почему важно: реестр `files` заполняют не все пути приёма — вложения из
 * личного Telegram исторически лежат в `message-attachments` без записи в
 * реестре. Хардкод бакета в отправляющей функции = вложение молча не уходит
 * клиенту (инцидент 2026-07-22: из письма ушёл 1 файл из 14). Тест фиксирует,
 * что fallback остаётся `message-attachments`, а не `files`.
 *
 * Живёт в client-free `_shared/buckets.ts` (сам `storage.ts` тянет aws4fetch по
 * https и в vitest не импортируется) — как фронтовый `src/lib/storage/buckets.ts`.
 */
import { describe, it, expect } from 'vitest'
import { attachmentLocationFromRow } from '../supabase/functions/_shared/buckets'

describe('attachmentLocationFromRow', () => {
  it('берёт бакет и путь из реестра, когда запись есть', () => {
    expect(
      attachmentLocationFromRow({
        storage_path: 'ws/thread/msg/legacy.pdf',
        file: { bucket: 'files', storage_path: 'ws/proj/msg/real.pdf' },
      }),
    ).toEqual({ bucket: 'files', storagePath: 'ws/proj/msg/real.pdf' })
  })

  // Регрессия 2026-07-22: у вложений из личного Telegram записи в реестре нет.
  it('без записи в реестре — бакет вложений, путь из строки', () => {
    expect(attachmentLocationFromRow({ storage_path: 'ws/thread/msg/file.pdf' })).toEqual({
      bucket: 'message-attachments',
      storagePath: 'ws/thread/msg/file.pdf',
    })
  })

  it('file: null (нет FK) — тот же fallback', () => {
    expect(
      attachmentLocationFromRow({ storage_path: 'ws/thread/msg/file.pdf', file: null }),
    ).toEqual({ bucket: 'message-attachments', storagePath: 'ws/thread/msg/file.pdf' })
  })

  // PostgREST для many-to-one отдаёт объект, но типы supabase-js в ряде версий
  // выводят массив — резолвер обязан понимать обе формы, иначе бакет молча
  // потеряется и файл не найдётся.
  it('embed пришёл массивом — берём первую запись', () => {
    expect(
      attachmentLocationFromRow({
        storage_path: 'ws/thread/msg/legacy.pdf',
        file: [{ bucket: 'files', storage_path: 'ws/proj/msg/real.pdf' }],
      }),
    ).toEqual({ bucket: 'files', storagePath: 'ws/proj/msg/real.pdf' })
  })

  it('пустой массив embed — fallback', () => {
    expect(attachmentLocationFromRow({ storage_path: 'ws/t/m/f.pdf', file: [] })).toEqual({
      bucket: 'message-attachments',
      storagePath: 'ws/t/m/f.pdf',
    })
  })

  it('битая запись реестра (пустой бакет) не уводит в никуда', () => {
    expect(
      attachmentLocationFromRow({
        storage_path: 'ws/thread/msg/file.pdf',
        file: { bucket: null, storage_path: 'ws/proj/msg/real.pdf' },
      }),
    ).toEqual({ bucket: 'message-attachments', storagePath: 'ws/thread/msg/file.pdf' })
  })
})
