"use client"

import { createContext, useContext } from 'react'
import type { FilterGroup } from '@/lib/filters/types'

/**
 * Корневая группа фильтра — для расчёта «умной» видимости полей в дочерних
 * редакторах. FilterRuleRow читает этот контекст, ищет ограничение по полю
 * `type` (на верхнем уровне группы) и сужает список доступных полей под
 * выбранные типы тредов.
 *
 * Если контекста нет — поведение прежнее: показываем все поля.
 */
export const FilterRootGroupContext = createContext<FilterGroup | null>(null)

export function useFilterRootGroup(): FilterGroup | null {
  return useContext(FilterRootGroupContext)
}
