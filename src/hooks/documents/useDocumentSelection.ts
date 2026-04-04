"use client"

/**
 * Хук для управления выбором документов
 * Поддерживает Shift-клик для выбора диапазона
 * Поддерживает cross-kit selection через глобальный реестр
 */

import { useState, useCallback, useMemo, useEffect, useId, useSyncExternalStore } from 'react'

// ==================== Глобальный реестр selection ====================

type SelectionEntry = {
  count: number
  selectedIds: Set<string>
}

/** Реестр: instanceId → данные о selection */
const registry = new Map<string, SelectionEntry>()
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) listener()
}

function getGlobalSelectionSnapshot(): { totalCount: number; allSelectedIds: Set<string> } {
  let totalCount = 0
  const allSelectedIds = new Set<string>()
  for (const entry of registry.values()) {
    totalCount += entry.count
    for (const id of entry.selectedIds) allSelectedIds.add(id)
  }
  return { totalCount, allSelectedIds }
}

// Кэшированный snapshot для useSyncExternalStore
let cachedSnapshot = getGlobalSelectionSnapshot()

function getSnapshot() {
  return cachedSnapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function updateRegistry(instanceId: string, selectedIds: Set<string>) {
  if (selectedIds.size === 0) {
    registry.delete(instanceId)
  } else {
    registry.set(instanceId, { count: selectedIds.size, selectedIds })
  }
  cachedSnapshot = getGlobalSelectionSnapshot()
  notifyListeners()
}

function removeFromRegistry(instanceId: string) {
  if (registry.has(instanceId)) {
    registry.delete(instanceId)
    cachedSnapshot = getGlobalSelectionSnapshot()
    notifyListeners()
  }
}

// Отдельный канал для clear-all (не путать с listeners для useSyncExternalStore)
const clearAllCallbacks = new Set<() => void>()

/** Очистить selection во всех инстансах */
function clearAllSelections() {
  registry.clear()
  cachedSnapshot = getGlobalSelectionSnapshot()
  // Сначала уведомляем каждый инстанс о необходимости очистить свой useState
  for (const cb of clearAllCallbacks) cb()
  // Потом уведомляем useSyncExternalStore
  notifyListeners()
}

// ==================== Публичный хук для чтения глобального selection ====================

/** Возвращает суммарное количество выбранных документов из всех наборов */
export function useGlobalSelectionCount(): number {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return snapshot.totalCount
}

/** Возвращает Set всех выбранных ID из всех наборов */
export function useGlobalSelectedIds(): Set<string> {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  return snapshot.allSelectedIds
}

/** Очистить selection глобально (для кнопки X в FloatingBatchActions) */
export { clearAllSelections }

// ==================== Основной хук ====================

interface Document {
  id: string
}

interface UseDocumentSelectionOptions {
  /** Все документы для подсчёта "выбрать все" */
  allDocuments?: Document[]
}

interface UseDocumentSelectionReturn {
  /** Множество ID выбранных документов */
  selectedDocuments: Set<string>
  /** Есть ли выбранные документы */
  hasSelection: boolean
  /** Все ли документы выбраны */
  allSelected: boolean
  /** Количество выбранных документов */
  selectedCount: number
  /** Переключить выбор документа (с поддержкой Shift-клика) */
  toggleSelection: (documentId: string, documentList?: Document[], event?: React.MouseEvent) => void
  /** Выбрать все документы */
  selectAll: (documents: Document[]) => void
  /** Снять выбор со всех документов */
  clearSelection: () => void
  /** Переключить "выбрать все" */
  toggleSelectAll: (documents: Document[]) => void
  /** Проверить, выбран ли документ */
  isSelected: (documentId: string) => boolean
}

export function useDocumentSelection(
  options: UseDocumentSelectionOptions = {},
): UseDocumentSelectionReturn {
  const { allDocuments = [] } = options

  const instanceId = useId()
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [lastSelectedDocumentId, setLastSelectedDocumentId] = useState<string | null>(null)

  // Синхронизируем локальный state с глобальным реестром
  useEffect(() => {
    updateRegistry(instanceId, selectedDocuments)
  }, [instanceId, selectedDocuments])

  // Слушаем глобальный clearAll (кнопка X в панели)
  useEffect(() => {
    const clearHandler = () => {
      setSelectedDocuments(new Set())
      setLastSelectedDocumentId(null)
    }
    clearAllCallbacks.add(clearHandler)
    return () => {
      clearAllCallbacks.delete(clearHandler)
      removeFromRegistry(instanceId)
    }
  }, [instanceId])

  const hasSelection = selectedDocuments.size > 0

  const allSelected = useMemo(() => {
    if (allDocuments.length === 0) return false
    return allDocuments.every((doc) => selectedDocuments.has(doc.id))
  }, [allDocuments, selectedDocuments])

  const selectedCount = selectedDocuments.size

  const toggleSelection = useCallback(
    (documentId: string, documentList?: Document[], event?: React.MouseEvent) => {
      const isShiftPressed = event?.shiftKey || false

      setSelectedDocuments((prev) => {
        const next = new Set(prev)

        // Если Shift зажат и есть список документов, выделяем/снимаем диапазон
        if (isShiftPressed && documentList && lastSelectedDocumentId) {
          const lastIndex = documentList.findIndex((d) => d.id === lastSelectedDocumentId)
          const currentIndex = documentList.findIndex((d) => d.id === documentId)

          if (lastIndex !== -1 && currentIndex !== -1) {
            const startIndex = Math.min(lastIndex, currentIndex)
            const endIndex = Math.max(lastIndex, currentIndex)

            // Если целевой документ уже выделен — снимаем выделение с диапазона
            const shouldDeselect = prev.has(documentId)
            for (let i = startIndex; i <= endIndex; i++) {
              if (shouldDeselect) {
                next.delete(documentList[i].id)
              } else {
                next.add(documentList[i].id)
              }
            }
          } else {
            // Если не нашли индексы, просто переключаем текущий
            if (next.has(documentId)) {
              next.delete(documentId)
            } else {
              next.add(documentId)
            }
          }
        } else {
          // Обычное переключение
          if (next.has(documentId)) {
            next.delete(documentId)
          } else {
            next.add(documentId)
          }
        }

        return next
      })

      // Сохраняем последний выделенный документ
      setLastSelectedDocumentId(documentId)
    },
    [lastSelectedDocumentId],
  )

  const selectAll = useCallback((documents: Document[]) => {
    setSelectedDocuments(new Set(documents.map((d) => d.id)))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedDocuments(new Set())
    setLastSelectedDocumentId(null)
  }, [])

  const toggleSelectAll = useCallback((documents: Document[]) => {
    setSelectedDocuments((prev) => {
      const allDocsSelected = documents.length > 0 && documents.every((doc) => prev.has(doc.id))
      if (allDocsSelected) {
        return new Set<string>()
      }
      return new Set(documents.map((d) => d.id))
    })
  }, [])

  const isSelected = useCallback(
    (documentId: string) => {
      return selectedDocuments.has(documentId)
    },
    [selectedDocuments],
  )

  return {
    selectedDocuments,
    hasSelection,
    allSelected,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
    toggleSelectAll,
    isSelected,
  }
}
