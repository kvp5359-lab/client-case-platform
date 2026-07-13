"use client"

/**
 * Держит активную вкладку в зоне видимости горизонтально-скроллящегося ряда.
 *
 * Единый механизм для всех рядов вкладок (модули проекта, доски/списки, вкладки
 * боковой панели). Ищет элемент с `data-tab-id === activeId` внутри переданного
 * контейнера и подскролливает к нему (`scrollIntoView`, ось inline). Раньше эту
 * логику дублировали три места — теперь она в одной точке.
 *
 * `activeId` — контролируемые id вкладок (module-ключи, `board:<uuid>` и т.п.),
 * спецсимволов для селектора в них нет, поэтому экранирование не нужно.
 */

import { useLayoutEffect, type RefObject } from 'react'

export function useScrollActiveTabIntoView(
  /** Контейнер, внутри которого лежат вкладки с атрибутом `data-tab-id`. */
  containerRef: RefObject<HTMLElement | null>,
  /** id активной вкладки (значение её `data-tab-id`). */
  activeId: string | null | undefined,
  options?: {
    /** Плавность прокрутки. По умолчанию мгновенно ('auto'). */
    behavior?: ScrollBehavior
    /** Доп. зависимости — перескролл при их изменении (напр. порядок вкладок). */
    deps?: readonly unknown[]
  },
) {
  const behavior = options?.behavior ?? 'auto'
  const extraDeps = options?.deps ?? []

  useLayoutEffect(() => {
    if (!activeId) return
    const scroll = () => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        `[data-tab-id="${activeId}"]`,
      )
      el?.scrollIntoView({ behavior, inline: 'nearest', block: 'nearest' })
    }
    // Синхронно (до paint) — обычный случай. Плюс на следующем кадре: когда
    // вкладку открывают из меню-«бутерброда», Radix при закрытии восстанавливает
    // фокус/раскладку уже ПОСЛЕ нашего скролла и сбивает позицию — повторный
    // проход в rAF перекрывает это и оставляет активную вкладку в зоне видимости.
    scroll()
    const raf = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(raf)
    // containerRef стабилен; extraDeps разворачиваем для перескролла по внешним изменениям.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, behavior, ...extraDeps])
}
