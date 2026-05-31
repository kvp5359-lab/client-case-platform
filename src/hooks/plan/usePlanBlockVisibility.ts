"use client"

/**
 * Видимость типов блоков плана (тумблеры «Заголовки / Текст / Документы»).
 * Состояние общее для UI-переключателей (в панели фильтров TaskListControls)
 * и для фильтрации списка (ProjectFlatPlanList), поэтому живёт в общем
 * родителе (TaskListView) через этот хук. Запоминается в localStorage —
 * флаги переживают reload. Ключ глобальный (одинаково во всех проектах).
 */

import { useEffect, useState } from 'react'

const LS_KEY = 'cc:plan-block-visibility-v1'

export type PlanBlockVisibility = {
  showHeadings: boolean
  setShowHeadings: (v: boolean) => void
  showText: boolean
  setShowText: (v: boolean) => void
  showSlots: boolean
  setShowSlots: (v: boolean) => void
}

function read(): { headings: boolean; text: boolean; slots: boolean } {
  const def = { headings: true, text: true, slots: true }
  if (typeof window === 'undefined') return def
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
    return {
      headings: typeof p?.headings === 'boolean' ? p.headings : true,
      text: typeof p?.text === 'boolean' ? p.text : true,
      slots: typeof p?.slots === 'boolean' ? p.slots : true,
    }
  } catch {
    return def
  }
}

export function usePlanBlockVisibility(): PlanBlockVisibility {
  const [showHeadings, setShowHeadings] = useState(() => read().headings)
  const [showText, setShowText] = useState(() => read().text)
  const [showSlots, setShowSlots] = useState(() => read().slots)
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ headings: showHeadings, text: showText, slots: showSlots }),
      )
    } catch {
      /* ignore quota errors */
    }
  }, [showHeadings, showText, showSlots])
  return { showHeadings, setShowHeadings, showText, setShowText, showSlots, setShowSlots }
}
