import { describe, it, expect, vi } from 'vitest'
import { isModifiedClick, entityLinkClickHandlers, threadHref } from './entityLinks'

/** Минимальное событие клика для хелперов (структурная типизация). */
function clickEvent(
  target: Element | null,
  overrides: Partial<{
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    button: number
  }> = {},
) {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    target,
    preventDefault: vi.fn(),
    ...overrides,
  }
}

/** <a><span>текст</span><button>…</button></a> — строка-ссылка со своим контролом. */
function buildRow() {
  const anchor = document.createElement('a')
  const text = document.createElement('span')
  const control = document.createElement('button')
  const roleControl = document.createElement('div')
  roleControl.setAttribute('role', 'button')
  const insideControl = document.createElement('span') // иконка ВНУТРИ кнопки
  control.appendChild(insideControl)
  anchor.append(text, control, roleControl)
  return { anchor, text, control, roleControl, insideControl }
}

describe('isModifiedClick', () => {
  it('обычный левый клик — не модифицированный', () => {
    expect(isModifiedClick(clickEvent(null))).toBe(false)
  })

  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['средняя кнопка', { button: 1 }],
  ])('%s → модифицированный (отдаём браузеру)', (_label, overrides) => {
    expect(isModifiedClick(clickEvent(null, overrides))).toBe(true)
  })
})

describe('entityLinkClickHandlers', () => {
  it('обычный клик по строке — гасит переход и открывает в панели', () => {
    const onOpen = vi.fn()
    const { text } = buildRow()
    const e = clickEvent(text)
    entityLinkClickHandlers(onOpen).onClick(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('Cmd+клик — НЕ гасит переход (браузер откроет новую вкладку)', () => {
    const onOpen = vi.fn()
    const { text } = buildRow()
    const e = clickEvent(text, { metaKey: true })
    entityLinkClickHandlers(onOpen).onClick(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('клик по кнопке внутри строки — переход гасится в ПЕРЕХВАТЕ (до stopPropagation потомка)', () => {
    const onOpen = vi.fn()
    const { control } = buildRow()
    const e = clickEvent(control)
    entityLinkClickHandlers(onOpen).onClickCapture(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('клик по иконке ВНУТРИ кнопки тоже не уводит по ссылке (closest)', () => {
    const onOpen = vi.fn()
    const { insideControl } = buildRow()
    const e = clickEvent(insideControl)
    entityLinkClickHandlers(onOpen).onClickCapture(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('role="button" (не тег button) тоже считается контролом', () => {
    const onOpen = vi.fn()
    const { roleControl } = buildRow()
    const e = clickEvent(roleControl)
    entityLinkClickHandlers(onOpen).onClickCapture(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('перехват на обычном тексте строки ничего не гасит', () => {
    const onOpen = vi.fn()
    const { text } = buildRow()
    const e = clickEvent(text)
    entityLinkClickHandlers(onOpen).onClickCapture(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('onClick по контролу не открывает панель (двойного действия нет)', () => {
    const onOpen = vi.fn()
    const { control } = buildRow()
    entityLinkClickHandlers(onOpen).onClick(clickEvent(control))
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('threadHref', () => {
  it('тред с проектом → страница проекта с panelTab', () => {
    expect(threadHref('ws', 'th', 'pr')).toBe('/workspaces/ws/projects/pr?panelTab=thread:th')
  })

  it('тред без проекта (личный диалог) → /inbox', () => {
    expect(threadHref('ws', 'th', null)).toBe('/workspaces/ws/inbox?panelTab=thread:th')
  })

  it('id треда экранируется (префикс thread: остаётся литералом)', () => {
    expect(threadHref('ws', 'a b&c', null)).toBe('/workspaces/ws/inbox?panelTab=thread:a%20b%26c')
  })
})
