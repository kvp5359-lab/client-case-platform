"use client"

/**
 * useScrollIntoViewOnPanel
 *
 * Когда справа открывается боковая панель (sidePanel / TaskPanel), она
 * физически «накрывает» часть контента. Если пользователь только что
 * кликнул по элементу в списке/доске — элемент может оказаться под
 * панелью и стать невидимым.
 *
 * Подход — DOM-driven через data-атрибуты на `body`:
 *   • `body[data-panel-open]` — основная правая sidePanel (ставится в
 *     WorkspaceLayout)
 *   • `body[data-task-panel-open]` — TaskPanel (ставится в компоненте
 *     TaskPanel, работает и для layout-уровневой, и для локальной в
 *     BoardsPage — это один и тот же компонент)
 *
 * Хук слушает mousedown, запоминает элемент и реагирует на появление
 * любого из атрибутов. Этот подход не зависит от React-стейта и работает
 * с любым местом, где бы TaskPanel ни была смонтирована.
 */

import { useEffect, useRef } from 'react'

const PANEL_SELECTOR = '.side-panel'
const BODY_ATTRS = ['data-panel-open', 'data-task-panel-open'] as const
const SAFE_MARGIN = 16
const PAD_ATTR = 'data-panel-scroll-pad'
const CLICK_FRESHNESS_MS = 1000
// Ждём после появления атрибута, чтобы панель доехала translate-x анимацию
const POST_APPEAR_DELAY_MS = 240

interface LastClick {
  el: HTMLElement
  ts: number
}

/** True, если открыта хотя бы одна боковая панель. */
function isAnyPanelOpen(): boolean {
  return BODY_ATTRS.some((attr) => document.body.hasAttribute(attr))
}

/**
 * Левая граница самой левой открытой side-panel в координатах viewport.
 * Возвращает innerWidth, если ни одной панели нет.
 */
function getPanelLeftEdge(): number {
  const panels = document.querySelectorAll<HTMLElement>(PANEL_SELECTOR)
  let minLeft = window.innerWidth
  panels.forEach((p) => {
    if (p.offsetParent === null) return
    const rect = p.getBoundingClientRect()
    if (rect.width > 0 && rect.left < minLeft) {
      minLeft = rect.left
    }
  })
  return minLeft
}

/**
 * Ближайший предок, который реально является горизонтальным скроллером.
 *
 * Подводный камень: Tailwind `overflow-y-auto` в браузерах даёт
 * `computed style overflow-x: auto` (если явно не переопределено) —
 * это делает вертикальный контейнер «ложно-положительным» для нашего поиска.
 *
 * Поэтому принимаем предок только если:
 *   1. Горизонтальный скролл уже есть (scrollWidth > clientWidth) — явно
 *      горизонтальный контейнер, или
 *   2. overflow-x = auto|scroll И при этом overflow-y НЕ auto|scroll
 *      (т.е. элемент задуман как именно горизонтальный — например,
 *      `overflow-x-auto overflow-y-hidden` на доске).
 */
function getHorizontalOverflowContainer(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    const ox = style.overflowX
    const oy = style.overflowY
    const hasHorizontalOverflow = node.scrollWidth > node.clientWidth
    const isExplicitHorizontal =
      (ox === 'auto' || ox === 'scroll') && oy !== 'auto' && oy !== 'scroll'

    if (hasHorizontalOverflow && (ox === 'auto' || ox === 'scroll')) {
      return node
    }
    if (isExplicitHorizontal) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/**
 * Первый дочерний элемент scroll-контейнера — ему добавляется временный
 * padding-right, чтобы расширить scrollWidth (padding на самом скроллере
 * не увеличивает его scrollWidth в большинстве браузеров).
 */
function getScrollContent(scroller: HTMLElement): HTMLElement | null {
  return (scroller.firstElementChild as HTMLElement | null) ?? null
}

/**
 * Поднимаемся вверх от клика до «значимого» элемента — то есть строки
 * задачи / карточки / кнопки, а не до `<span>` с текстом. `rect.right`
 * span'а не учитывает аватары/бейджи справа, из-за чего скролл оказывается
 * недостаточным.
 */
function resolveClickedRow(target: HTMLElement): HTMLElement {
  const row = target.closest<HTMLElement>(
    '[role="button"], button, [role="row"], [role="listitem"], li, tr, a[href]',
  )
  return row ?? target
}

/**
 * Проскроллить контейнер так, чтобы элемент оказался левее границы панели.
 * Если скролла не хватает — временно расширяет содержимое через padding-right.
 */
function scrollElementOutOfPanel(rawEl: HTMLElement) {
  const el = resolveClickedRow(rawEl)
  const panelLeft = getPanelLeftEdge()
  if (panelLeft >= window.innerWidth) return

  const rect = el.getBoundingClientRect()
  if (rect.right <= panelLeft - SAFE_MARGIN) return

  const shiftBy = rect.right - (panelLeft - SAFE_MARGIN)

  const scroller = getHorizontalOverflowContainer(el)
  if (!scroller) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    return
  }

  const currentRoom = scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft
  const needed = shiftBy - currentRoom
  if (needed > 0) {
    const content = getScrollContent(scroller)
    if (content) {
      const prevPad = parseFloat(content.style.paddingRight || '0') || 0
      const newPad = prevPad + needed + SAFE_MARGIN
      content.style.paddingRight = `${newPad}px`
      content.setAttribute(PAD_ATTR, String(prevPad))
      // Принудительный reflow, чтобы scrollWidth увидел новый padding
      void content.offsetWidth
    }
  }

  const maxScroll = scroller.scrollWidth - scroller.clientWidth
  const target = Math.min(maxScroll, scroller.scrollLeft + shiftBy)
  if (target > scroller.scrollLeft) {
    scroller.scrollTo({ left: target, behavior: 'smooth' })
  }
}

/** Снять временный padding-right, который мы добавляли при открытии панели. */
function clearScrollPadding() {
  document.querySelectorAll<HTMLElement>(`[${PAD_ATTR}]`).forEach((el) => {
    const prev = el.getAttribute(PAD_ATTR)
    el.style.paddingRight = prev && prev !== '0' ? `${prev}px` : ''
    el.removeAttribute(PAD_ATTR)
  })
}

/**
 * Хук-слушатель. Вызывается один раз в shell-лейауте.
 */
export function useScrollIntoViewOnPanel() {
  const lastClickRef = useRef<LastClick | null>(null)
  const prevOpenRef = useRef<boolean>(false)

  useEffect(() => {
    prevOpenRef.current = isAnyPanelOpen()

    // Отложенный вызов скролла — один на весь жизненный цикл эффекта,
    // перезапускается при каждом релевантном событии.
    let postAppearTimer: number | null = null

    // Запомнить кликнутый элемент вне панели
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest(PANEL_SELECTOR)) {
        lastClickRef.current = null
        return
      }
      lastClickRef.current = { el: target, ts: Date.now() }

      // Если панель УЖЕ открыта на момент клика — MutationObserver может не
      // сработать (атрибут body не изменится: task-panel просто обновляется
      // изнутри). Триггерим скролл самостоятельно с задержкой, чтобы дать
      // React успеть обновить содержимое панели.
      if (isAnyPanelOpen()) {
        if (postAppearTimer !== null) window.clearTimeout(postAppearTimer)
        postAppearTimer = window.setTimeout(() => {
          const click = lastClickRef.current
          if (!click || !click.el.isConnected) return
          scrollElementOutOfPanel(click.el)
        }, POST_APPEAR_DELAY_MS)
      }
    }
    window.addEventListener('mousedown', handleMouseDown, true)

    // Наблюдаем ТОЛЬКО за изменением атрибутов на body — это дёшево.
    const onPanelOpenedOrChanged = () => {
      const click = lastClickRef.current
      if (!click) return
      if (Date.now() - click.ts > CLICK_FRESHNESS_MS) return
      if (!click.el.isConnected) return
      if (postAppearTimer !== null) window.clearTimeout(postAppearTimer)
      postAppearTimer = window.setTimeout(() => {
        scrollElementOutOfPanel(click.el)
      }, POST_APPEAR_DELAY_MS)
    }

    const observer = new MutationObserver((mutations) => {
      let relevant = false
      for (const m of mutations) {
        if (m.type !== 'attributes') continue
        if (!m.attributeName) continue
        if (BODY_ATTRS.includes(m.attributeName as (typeof BODY_ATTRS)[number])) {
          relevant = true
          break
        }
      }
      if (!relevant) return

      const open = isAnyPanelOpen()
      const wasOpen = prevOpenRef.current
      prevOpenRef.current = open

      if (!wasOpen && open) {
        // Панель открылась
        onPanelOpenedOrChanged()
      } else if (wasOpen && open) {
        // Панель была открыта и осталась открытой — сменился состав
        // (например, закрыли TaskPanel, но открыта sidePanel). Всё ещё
        // повод проверить видимость кликнутого элемента.
        onPanelOpenedOrChanged()
      } else if (wasOpen && !open) {
        // Всё закрылось — снимаем временный padding
        clearScrollPadding()
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...BODY_ATTRS],
    })

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true)
      observer.disconnect()
      if (postAppearTimer !== null) window.clearTimeout(postAppearTimer)
    }
  }, [])
}
