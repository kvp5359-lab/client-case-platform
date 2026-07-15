/**
 * Тесты общего резолва размещения файла.
 *
 * Модуль общий для документов и вложений мессенджера, поэтому ошибка здесь
 * ломает открытие/скачивание сразу в обеих зонах — отсюда тесты на все три
 * ветки, включая легаси-записи без file_id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import { resolveFileLocation } from './resolveFileLocation'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase')

function mockFilesRow(row: { bucket: string; storage_path: string } | null) {
  vi.mocked(supabase.from).mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } }),
      }),
    }),
  } as unknown as SupabaseFrom)
}

describe('resolveFileLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('без file_id отдаёт фолбэк-бакет и исходный путь (легаси-запись)', async () => {
    const result = await resolveFileLocation('legacy/path.pdf', null, 'document-files')

    expect(result).toEqual({ bucket: 'document-files', path: 'legacy/path.pdf' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('с file_id берёт бакет и путь из реестра files, а не фолбэк', async () => {
    mockFilesRow({ bucket: 'files', storage_path: 'ws/proj/real.pdf' })

    const result = await resolveFileLocation('stale/path.pdf', 'file-1', 'document-files')

    expect(result).toEqual({ bucket: 'files', path: 'ws/proj/real.pdf' })
  })

  it('если записи в реестре нет — откатывается на фолбэк, а не падает', async () => {
    mockFilesRow(null)

    const result = await resolveFileLocation('legacy/path.pdf', 'missing', 'message-attachments')

    expect(result).toEqual({ bucket: 'message-attachments', path: 'legacy/path.pdf' })
  })
})
