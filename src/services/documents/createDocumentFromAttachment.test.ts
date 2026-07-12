/**
 * Тесты createDocumentFromAttachment — единая точка импорта вложения мессенджера
 * в документы (drag из чата + «Добавить в проект»). Критичная ветка — file_id=null
 * (MTProto): нужно создать/переиспользовать files-строку в бакете message-attachments,
 * иначе резолв бакета уходит в document-files и файл не находится.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/lib/supabase'
import { createDocumentFromAttachment } from './documentService'
import { DocumentError } from '../errors/AppError'

type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/lib/supabase')

const PARAMS = {
  name: 'Документ',
  kitId: 'kit-1',
  folderId: 'folder-1',
  projectId: 'proj-1',
  workspaceId: 'ws-1',
}

const ATT = {
  file_name: 'file.pdf',
  storage_path: 'ws-1/a/b/123-x.pdf',
  file_size: 100,
  mime_type: 'application/pdf',
}

/** Собирает мок supabase.from по таблицам из переданных хендлеров. */
function mockFrom(handlers: {
  documentsInsert?: { data: unknown; error: unknown }
  documentFilesInsert?: { error: unknown }
  filesSelect?: { data: unknown }
  filesInsert?: { data: unknown; error: unknown }
}) {
  const documentsDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const filesSelectMaybe = vi.fn().mockResolvedValue(handlers.filesSelect ?? { data: null })
  const filesInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(handlers.filesInsert ?? { data: { id: 'files-new' }, error: null }),
    }),
  })
  const documentFilesInsert = vi.fn().mockResolvedValue(handlers.documentFilesInsert ?? { error: null })

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'documents') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              handlers.documentsInsert ?? { data: { id: 'doc-1' }, error: null },
            ),
          }),
        }),
        delete: documentsDelete,
      } as unknown as SupabaseFrom
    }
    if (table === 'files') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: filesSelectMaybe }),
          }),
        }),
        insert: filesInsert,
      } as unknown as SupabaseFrom
    }
    if (table === 'document_files') {
      return { insert: documentFilesInsert } as unknown as SupabaseFrom
    }
    return {} as unknown as SupabaseFrom
  })

  return { documentsDelete, filesSelectMaybe, filesInsert, documentFilesInsert }
}

describe('createDocumentFromAttachment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('file_id есть — используется как есть, files не трогается', async () => {
    const m = mockFrom({})
    const result = await createDocumentFromAttachment({ ...ATT, file_id: 'f-existing' }, PARAMS)

    expect(result).toEqual({ id: 'doc-1' })
    expect(m.filesSelectMaybe).not.toHaveBeenCalled()
    expect(m.filesInsert).not.toHaveBeenCalled()
    expect(m.documentFilesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'f-existing' }),
    )
  })

  it('file_id=null + существующая files-строка — переиспользуется, INSERT не вызывается', async () => {
    const m = mockFrom({ filesSelect: { data: { id: 'files-exist' } } })
    const result = await createDocumentFromAttachment({ ...ATT, file_id: null }, PARAMS)

    expect(result).toEqual({ id: 'doc-1' })
    expect(m.filesSelectMaybe).toHaveBeenCalled()
    expect(m.filesInsert).not.toHaveBeenCalled()
    expect(m.documentFilesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'files-exist' }),
    )
  })

  it('file_id=null без строки — создаётся files-строка в message-attachments', async () => {
    const m = mockFrom({ filesSelect: { data: null }, filesInsert: { data: { id: 'files-new' }, error: null } })
    const result = await createDocumentFromAttachment({ ...ATT, file_id: null }, PARAMS)

    expect(result).toEqual({ id: 'doc-1' })
    expect(m.filesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'message-attachments', storage_path: ATT.storage_path }),
    )
    expect(m.documentFilesInsert).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'files-new' }),
    )
  })

  it('ошибка INSERT documents — бросает DocumentError, files не трогается', async () => {
    const m = mockFrom({ documentsInsert: { data: null, error: { message: 'boom' } } })
    await expect(createDocumentFromAttachment({ ...ATT, file_id: null }, PARAMS)).rejects.toBeInstanceOf(
      DocumentError,
    )
    expect(m.filesInsert).not.toHaveBeenCalled()
    expect(m.documentFilesInsert).not.toHaveBeenCalled()
  })

  it('ошибка INSERT document_files — откатывает documents и бросает', async () => {
    const m = mockFrom({ documentFilesInsert: { error: { message: 'df boom' } } })
    await expect(
      createDocumentFromAttachment({ ...ATT, file_id: 'f-existing' }, PARAMS),
    ).rejects.toBeInstanceOf(DocumentError)
    expect(m.documentsDelete).toHaveBeenCalled()
  })
})
