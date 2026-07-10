"use client"

/**
 * Общий overflow-механизм для рядов вкладок (вкладки проекта, вкладки досок).
 *
 * Идея: все вкладки, что не помещаются по ширине ряда, уходят в кнопку-«бутерброд»
 * справа (без горизонтального скролла). Активная вкладка всегда видима в ряду.
 *
 * Ширины меряются в СКРЫТОМ ряду-клоне (стабильный источник — там всегда все
 * вкладки, отрисованные caller'ом через `measureRef` с `data-tab-id`). Клон
 * должен по ширине примерно совпадать с реальной вкладкой (иконка + подпись).
 * ResizeObserver пересчитывает при изменении ширины (в т.ч. при открытии панели).
 *
 * `activeExtraPx` — доп. ширина активной вкладки, которой нет в клоне (напр.
 * «⋮»-меню, появляющееся только у активной). Без него число видимых вкладок
 * скакало бы при переключении на вкладку с таким меню.
 */

import { useLayoutEffect, useRef, useState } from 'react'

export function useOverflowTabs<T extends { id: string }>({
  items,
  activeId,
  reservePx,
  activeExtraPx = 0,
}: {
  items: T[]
  activeId: string | null
  /** Резерв ширины под кнопку-бутерброд (+ «плюс» и т.п.). */
  reservePx: number
  /** Доп. ширина активной вкладки, не учтённая в клоне (напр. «⋮»-меню). */
  activeExtraPx?: number
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)

  const itemsKey = items.map((i) => i.id).join(',')

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const avail = row.clientWidth - reservePx
      const kids = Array.from(measure.children) as HTMLElement[]
      let sum = 0
      let fit = 0
      for (const k of kids) {
        const w = k.offsetWidth + (k.dataset.tabId === activeId ? activeExtraPx : 0)
        if (sum + w > avail) break
        sum += w
        fit++
      }
      setVisibleCount(Math.max(1, fit))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
    // Перезамер при смене набора/активной (её ширина с «⋮» иная) и параметров.
  }, [itemsKey, activeId, reservePx, activeExtraPx])

  // Активная вкладка всегда видима: если она за порогом — заменяет последний слот.
  const activeIndex = items.findIndex((i) => i.id === activeId)
  let visible = items.slice(0, visibleCount)
  if (activeIndex >= 0 && activeIndex >= visibleCount) {
    visible = [...items.slice(0, Math.max(0, visibleCount - 1)), items[activeIndex]]
  }
  const visibleIds = new Set(visible.map((i) => i.id))
  const hidden = items.filter((i) => !visibleIds.has(i.id))

  return { rowRef, measureRef, visible, hidden }
}
