/**
 * Тесты для утилит Supabase JSON
 */

import { describe, it, expect } from 'vitest'
import { fromSupabaseJson, toSupabaseJson } from './supabaseJson'

interface TestType {
  name: string
  value: number
}

describe('fromSupabaseJson', () => {
  it('должен привести Json к указанному типу', () => {
    const json = { name: 'test', value: 42 }
    const result = fromSupabaseJson<TestType>(json)
    expect(result).toEqual({ name: 'test', value: 42 })
    expect(result.name).toBe('test')
    expect(result.value).toBe(42)
  })

  it('должен обработать null', () => {
    const result = fromSupabaseJson<TestType | null>(null)
    expect(result).toBeNull()
  })

  it('должен обработать вложенные объекты', () => {
    const json = { nested: { deep: true } }
    const result = fromSupabaseJson<{ nested: { deep: boolean } }>(json)
    expect(result.nested.deep).toBe(true)
  })
})

describe('toSupabaseJson', () => {
  it('должен привести типизированное значение к Json', () => {
    const value: TestType = { name: 'test', value: 42 }
    const result = toSupabaseJson(value)
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('должен обработать null', () => {
    const result = toSupabaseJson(null)
    expect(result).toBeNull()
  })
})
