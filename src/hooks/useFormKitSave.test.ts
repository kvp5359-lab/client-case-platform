/**
 * Тесты для useFormKitSave — хук сохранения данных анкеты
 *
 * Текущая реализация: insert-first с fallback на update при конфликте (код 23505).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { useFormKitSave } from './useFormKitSave'
import { createQueryWrapper } from '@/test/testUtils'
import { toast } from 'sonner'

vi.mock('@/lib/supabase')
vi.mock('@/utils/logger')
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Хелпер для мока insert: supabase.from().insert().select().maybeSingle()
function mockSupabaseInsertChain(error: unknown = null, data: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const select = vi.fn().mockReturnValue({ maybeSingle })
  const insert = vi.fn().mockReturnValue({ select })
  return { insert, select, maybeSingle }
}

// Хелпер для мока update (при конфликте 23505):
// supabase.from().update().eq().eq().is/eq().select()
function mockSupabaseUpdateChain(error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data: [{ id: 'updated-1' }], error })
  const isOrEq = vi.fn().mockReturnValue({ select })
  const eqField = vi.fn().mockReturnValue({ eq: isOrEq, is: isOrEq })
  const eqKit = vi.fn().mockReturnValue({ eq: eqField })
  const update = vi.fn().mockReturnValue({ eq: eqKit })
  return { update, eqKit, eqField, isOrEq, select }
}

describe('useFormKitSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен вернуть начальное состояние: isSaving=false, saveError=null, lastSaved=null', () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    expect(result.current.isSaving).toBe(false)
    expect(result.current.saveError).toBeNull()
    expect(result.current.lastSaved).toBeNull()
    expect(typeof result.current.saveField).toBe('function')
  })

  it('должен вставить новую запись для обычного поля (insert успешен)', async () => {
    const { wrapper } = createQueryWrapper()

    // insert успешен — нет конфликта
    const insertChain = mockSupabaseInsertChain(null)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    act(() => {
      result.current.saveField('field-abc', 'hello')
    })

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false)
    })

    // Проверяем insert
    expect(supabase.from).toHaveBeenCalledWith('form_kit_field_values')
    expect(insertChain.insert).toHaveBeenCalledWith({
      form_kit_id: 'kit-1',
      field_definition_id: 'field-abc',
      composite_field_id: null,
      value: 'hello',
    })
  })

  it('должен обновить существующую запись при конфликте (23505)', async () => {
    const { wrapper } = createQueryWrapper()

    // insert вернёт ошибку 23505 (unique_violation)
    const insertChain = mockSupabaseInsertChain({ message: 'duplicate key', code: '23505' })
    // update должен вызваться как fallback
    const updateChain = mockSupabaseUpdateChain(null)

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return { insert: insertChain.insert } as unknown as ReturnType<typeof supabase.from>
      }
      return { update: updateChain.update } as unknown as ReturnType<typeof supabase.from>
    })

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    act(() => {
      result.current.saveField('field-abc', 'updated')
    })

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false)
    })

    // Проверяем что update вызвался
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ value: 'updated' }))
  })

  it('должен вставить запись для вложенного (composite) поля', async () => {
    const { wrapper } = createQueryWrapper()

    const insertChain = mockSupabaseInsertChain(null)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    // Составной ключ: compositeId:nestedId
    act(() => {
      result.current.saveField('comp-1:nested-1', 'value123')
    })

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false)
    })

    // insert с composite_field_id
    expect(insertChain.insert).toHaveBeenCalledWith({
      form_kit_id: 'kit-1',
      field_definition_id: 'nested-1',
      composite_field_id: 'comp-1',
      value: 'value123',
    })
  })

  it('должен обновить существующую запись для вложенного (composite) поля при конфликте', async () => {
    const { wrapper } = createQueryWrapper()

    const insertChain = mockSupabaseInsertChain({ message: 'duplicate key', code: '23505' })
    const updateChain = mockSupabaseUpdateChain(null)

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return { insert: insertChain.insert } as unknown as ReturnType<typeof supabase.from>
      }
      return { update: updateChain.update } as unknown as ReturnType<typeof supabase.from>
    })

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    act(() => {
      result.current.saveField('comp-1:nested-1', 'new-value')
    })

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false)
    })

    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ value: 'new-value' }))
  })

  it('должен установить lastSaved после успешного сохранения', async () => {
    const { wrapper } = createQueryWrapper()

    const insertChain = mockSupabaseInsertChain(null)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    expect(result.current.lastSaved).toBeNull()

    act(() => {
      result.current.saveField('field-1', 'val')
    })

    await waitFor(() => {
      expect(result.current.lastSaved).toBeInstanceOf(Date)
    })

    expect(result.current.saveError).toBeNull()
  })

  it('должен установить saveError и показать toast при ошибке insert (не 23505)', async () => {
    const { wrapper } = createQueryWrapper()

    // insert завершается с ошибкой (не 23505)
    const dbError = { message: 'Database error', code: '500' }
    const insertChain = mockSupabaseInsertChain(dbError)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    act(() => {
      result.current.saveField('field-1', 'val')
    })

    await waitFor(
      () => {
        expect(result.current.saveError).not.toBeNull()
      },
      { timeout: 15_000 },
    )

    expect(toast.error).toHaveBeenCalledWith('Ошибка сохранения поля', {
      description: expect.any(String),
    })
    expect(result.current.lastSaved).toBeNull()
  })

  it('должен корректно парсить composite ключ по наличию ":"', async () => {
    const { wrapper } = createQueryWrapper()

    // Тест 1: обычное поле "simple-id" — composite_field_id = null
    const insertChain1 = mockSupabaseInsertChain(null)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain1.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    const { result } = renderHook(() => useFormKitSave({ formKitId: 'kit-1' }), { wrapper })

    act(() => {
      result.current.saveField('simple-id', 'val')
    })

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false)
    })

    expect(insertChain1.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        field_definition_id: 'simple-id',
        composite_field_id: null,
      }),
    )

    // Тест 2: composite поле "some-comp:nested-id"
    const insertChain2 = mockSupabaseInsertChain(null)

    vi.mocked(supabase.from).mockReturnValue({
      insert: insertChain2.insert,
    } as unknown as ReturnType<typeof supabase.from>)

    act(() => {
      result.current.saveField('some-comp:nested-id', 'val2')
    })

    await waitFor(() => {
      expect(result.current.lastSaved).toBeInstanceOf(Date)
    })

    expect(insertChain2.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        field_definition_id: 'nested-id',
        composite_field_id: 'some-comp',
      }),
    )
  })
})
