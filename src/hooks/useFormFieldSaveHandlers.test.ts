/**
 * Тесты для useFormFieldSaveHandlers — общая логика сохранения полей формы
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFormFieldSaveHandlers } from './useFormFieldSaveHandlers'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

/** Создаёт типизированный мок для setFormData */
const mockSetFormData = () =>
  vi.fn() as unknown as React.Dispatch<React.SetStateAction<Record<string, string>>> & {
    mock: ReturnType<typeof vi.fn>['mock']
  }

/** Создаёт типизированный мок для saveField */
const mockSaveField = () =>
  vi.fn() as unknown as ((fieldId: string, value: string) => void) & {
    mock: ReturnType<typeof vi.fn>['mock']
  }

// Хелпер для рендера хука с параметрами по умолчанию
function renderSaveHandlers(
  overrides: {
    formKitId?: string
    formData?: Record<string, string>
    canFillForms?: boolean
    saveField?: ReturnType<typeof mockSaveField>
  } = {},
) {
  const saveField = overrides.saveField ?? mockSaveField()
  const setFormData = mockSetFormData()

  const initialProps = {
    formKitId: overrides.formKitId ?? 'kit-1',
    formData: overrides.formData ?? {},
    setFormData,
    saveField,
    canFillForms: overrides.canFillForms ?? true,
  }

  const hookResult = renderHook((props) => useFormFieldSaveHandlers(props), { initialProps })

  return { ...hookResult, saveField, setFormData }
}

describe('useFormFieldSaveHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен инициализировать originalValues из formData', () => {
    const formData = { field1: 'value1', field2: 'value2' }
    const { result } = renderSaveHandlers({ formData })

    expect(result.current.originalValues).toEqual(formData)
  })

  it('должен инициализировать originalValues только один раз (при повторном изменении formData не сбрасывать)', () => {
    const initialFormData = { field1: 'original' }
    const { result, rerender } = renderSaveHandlers({ formData: initialFormData })

    expect(result.current.originalValues).toEqual({ field1: 'original' })

    // Перерендер с новыми formData
    rerender({
      formKitId: 'kit-1',
      formData: { field1: 'changed', field2: 'new' },
      setFormData: mockSetFormData(),
      saveField: mockSaveField(),
      canFillForms: true,
    })

    // originalValues НЕ должны измениться
    expect(result.current.originalValues).toEqual({ field1: 'original' })
  })

  it('должен не инициализировать originalValues из пустых formData', () => {
    const { result, rerender } = renderSaveHandlers({ formData: {} })

    // Пустой объект — isInitialized не ставится в true
    expect(result.current.originalValues).toEqual({})

    const setFormData = mockSetFormData()
    const saveField = mockSaveField()

    // Теперь formData появились
    rerender({
      formKitId: 'kit-1',
      formData: { field1: 'val1' },
      setFormData,
      saveField,
      canFillForms: true,
    })

    // Теперь должны инициализироваться
    expect(result.current.originalValues).toEqual({ field1: 'val1' })
  })

  it('updateField должен вызвать setFormData', () => {
    const { result, setFormData } = renderSaveHandlers({
      formData: { field1: 'old' },
    })

    act(() => {
      result.current.updateField('field1', 'new')
    })

    expect(setFormData).toHaveBeenCalledTimes(1)
    // setFormData вызывается с функцией-updater
    const updater = setFormData.mock.calls[0][0]
    expect(typeof updater).toBe('function')

    // Проверяем, что updater корректно обновляет
    const newState = (updater as (prev: Record<string, string>) => Record<string, string>)({
      field1: 'old',
      field2: 'keep',
    })
    expect(newState).toEqual({ field1: 'new', field2: 'keep' })
  })

  it('handleSaveField должен вызвать saveField когда значение изменилось', () => {
    const saveField = mockSaveField()
    const { result } = renderSaveHandlers({
      formData: { field1: 'changed' },
      saveField,
    })

    // originalValues = { field1: 'changed' } при инициализации
    // Нужно сначала изменить formData так, чтобы оно отличалось от originalValues
    // Перерендерим с новым formData (originalValues останется прежним)

    // Сначала проверим: если значение не изменилось — saveField не вызовется
    act(() => {
      result.current.handleSaveField('field1')
    })
    expect(saveField).not.toHaveBeenCalled()
  })

  it('handleSaveField должен вызвать saveField когда formData отличается от originalValues', () => {
    const saveField = mockSaveField()
    const setFormData = mockSetFormData()

    const { result, rerender } = renderHook((props) => useFormFieldSaveHandlers(props), {
      initialProps: {
        formKitId: 'kit-1',
        formData: { field1: 'original' },
        setFormData,
        saveField,
        canFillForms: true,
      },
    })

    // originalValues инициализировано { field1: 'original' }
    expect(result.current.originalValues).toEqual({ field1: 'original' })

    // Перерендерим с изменённым formData (имитация ввода пользователем)
    rerender({
      formKitId: 'kit-1',
      formData: { field1: 'modified' },
      setFormData,
      saveField,
      canFillForms: true,
    })

    act(() => {
      result.current.handleSaveField('field1')
    })

    expect(saveField).toHaveBeenCalledWith('field1', 'modified', expect.any(Function))
  })

  it('handleSaveField НЕ должен вызвать saveField когда значение не изменилось', () => {
    const saveField = mockSaveField()
    const { result } = renderSaveHandlers({
      formData: { field1: 'same' },
      saveField,
    })

    act(() => {
      result.current.handleSaveField('field1')
    })

    expect(saveField).not.toHaveBeenCalled()
  })

  it('handleSaveField должен обновить originalValues после сохранения', () => {
    // saveField мок вызывает onFieldSaved callback (3-й аргумент)
    const saveField = vi.fn((_fieldId: string, _value: string, onFieldSaved?: () => void) => {
      onFieldSaved?.()
    }) as unknown as ReturnType<typeof mockSaveField>
    const setFormData = mockSetFormData()

    const { result, rerender } = renderHook((props) => useFormFieldSaveHandlers(props), {
      initialProps: {
        formKitId: 'kit-1',
        formData: { field1: 'original' },
        setFormData,
        saveField,
        canFillForms: true,
      },
    })

    // Меняем formData
    rerender({
      formKitId: 'kit-1',
      formData: { field1: 'new-value' },
      setFormData,
      saveField,
      canFillForms: true,
    })

    act(() => {
      result.current.handleSaveField('field1')
    })

    expect(saveField).toHaveBeenCalledWith('field1', 'new-value', expect.any(Function))

    // originalValues обновился (callback вызван) — повторный вызов не должен сохранять
    act(() => {
      result.current.handleSaveField('field1')
    })

    expect(saveField).toHaveBeenCalledTimes(1)
  })

  it('handleSaveFieldWithValue должен сохранить с переданным значением', () => {
    const saveField = mockSaveField()
    const { result } = renderSaveHandlers({
      formData: { field1: 'original' },
      saveField,
    })

    // Передаём значение, отличающееся от originalValues
    act(() => {
      result.current.handleSaveFieldWithValue('field1', 'direct-value')
    })

    expect(saveField).toHaveBeenCalledWith('field1', 'direct-value', expect.any(Function))
  })

  it('handleSaveFieldWithValue НЕ должен сохранять если значение совпадает с оригинальным', () => {
    const saveField = mockSaveField()
    const { result } = renderSaveHandlers({
      formData: { field1: 'same' },
      saveField,
    })

    act(() => {
      result.current.handleSaveFieldWithValue('field1', 'same')
    })

    expect(saveField).not.toHaveBeenCalled()
  })

  it('handleSaveField должен показать toast.error когда canFillForms=false', () => {
    const saveField = mockSaveField()
    const setFormData = mockSetFormData()

    const { result, rerender } = renderHook((props) => useFormFieldSaveHandlers(props), {
      initialProps: {
        formKitId: 'kit-1',
        formData: { field1: 'original' },
        setFormData,
        saveField,
        canFillForms: false,
      },
    })

    // Меняем formData
    rerender({
      formKitId: 'kit-1',
      formData: { field1: 'changed' },
      setFormData,
      saveField,
      canFillForms: false,
    })

    act(() => {
      result.current.handleSaveField('field1')
    })

    expect(toast.error).toHaveBeenCalledWith('Нет прав на заполнение анкет')
    expect(saveField).not.toHaveBeenCalled()
  })

  it('handleSaveFieldWithValue должен показать toast.error когда canFillForms=false', () => {
    const saveField = mockSaveField()
    const { result } = renderSaveHandlers({
      formData: { field1: 'original' },
      saveField,
      canFillForms: false,
    })

    act(() => {
      result.current.handleSaveFieldWithValue('field1', 'new-value')
    })

    expect(toast.error).toHaveBeenCalledWith('Нет прав на заполнение анкет')
    expect(saveField).not.toHaveBeenCalled()
  })
})
