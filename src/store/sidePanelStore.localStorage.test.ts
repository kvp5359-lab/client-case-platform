/**
 * Тесты для sidePanelStore.localStorage — низкоуровневые обёртки
 * над localStorage с защитой от ошибок (quota exceeded, недоступный
 * localStorage в SSR/приватном режиме).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  lsGet,
  lsSet,
  lsClearPanelKeys,
  loadPersistedState,
  LS_KEY_SOURCES,
  LS_KEY_SOURCES_PREFIX,
  LS_KEY_CONVERSATIONS,
  LS_KEY_AI_TAB,
  LS_KEY_PANEL_TAB_PREFIX,
  LS_KEY_PANEL_STATE,
  LS_KEY_ACTIVE_THREAD_PREFIX,
} from './sidePanelStore.localStorage'

// jsdom в этом проекте запущен с --localstorage-file без валидного пути,
// из-за чего localStorage в окружении неполный. Подкладываем свой мок,
// который полностью реализует Storage API.
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      store = {}
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
  }
}

let mockStorage: Storage

beforeEach(() => {
  mockStorage = createLocalStorageMock()
  vi.stubGlobal('localStorage', mockStorage)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('lsGet', () => {
  it('возвращает fallback если ключа нет', () => {
    expect(lsGet('missing-key', 'default')).toBe('default')
    expect(lsGet('missing-key', null)).toBe(null)
    expect(lsGet('missing-key', { a: 1 })).toEqual({ a: 1 })
  })

  it('парсит JSON и возвращает значение', () => {
    localStorage.setItem('test-key', JSON.stringify({ foo: 'bar', count: 5 }))
    expect(lsGet('test-key', null)).toEqual({ foo: 'bar', count: 5 })
  })

  it('возвращает примитивы корректно', () => {
    localStorage.setItem('str', JSON.stringify('hello'))
    localStorage.setItem('num', JSON.stringify(42))
    localStorage.setItem('bool', JSON.stringify(true))

    expect(lsGet<string>('str', '')).toBe('hello')
    expect(lsGet<number>('num', 0)).toBe(42)
    expect(lsGet<boolean>('bool', false)).toBe(true)
  })

  it('возвращает fallback при битом JSON', () => {
    localStorage.setItem('broken', 'not valid json {{{')
    expect(lsGet('broken', 'fallback')).toBe('fallback')
  })

  it('возвращает fallback если localStorage недоступен', () => {
    vi.stubGlobal('localStorage', {
      ...mockStorage,
      getItem: () => {
        throw new Error('localStorage disabled')
      },
    })
    expect(lsGet('any-key', 'safe-default')).toBe('safe-default')
  })
})

describe('lsSet', () => {
  it('записывает значение как JSON', () => {
    lsSet('test-key', { foo: 'bar' })
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify({ foo: 'bar' }))
  })

  it('сериализует примитивы', () => {
    lsSet('str', 'hello')
    lsSet('num', 42)
    lsSet('bool', false)

    expect(localStorage.getItem('str')).toBe('"hello"')
    expect(localStorage.getItem('num')).toBe('42')
    expect(localStorage.getItem('bool')).toBe('false')
  })

  it('тихо игнорирует ошибки записи (quota exceeded)', () => {
    vi.stubGlobal('localStorage', {
      ...mockStorage,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    // Не должен бросать
    expect(() => lsSet('key', 'value')).not.toThrow()
  })
})

describe('lsClearPanelKeys', () => {
  it('удаляет фиксированные ключи панели', () => {
    localStorage.setItem(LS_KEY_SOURCES, '{"foo":"bar"}')
    localStorage.setItem(LS_KEY_CONVERSATIONS, '{}')
    localStorage.setItem(LS_KEY_AI_TAB, '"sources"')
    localStorage.setItem(LS_KEY_PANEL_STATE, '{"tab":"client"}')

    lsClearPanelKeys()

    expect(localStorage.getItem(LS_KEY_SOURCES)).toBe(null)
    expect(localStorage.getItem(LS_KEY_CONVERSATIONS)).toBe(null)
    expect(localStorage.getItem(LS_KEY_AI_TAB)).toBe(null)
    expect(localStorage.getItem(LS_KEY_PANEL_STATE)).toBe(null)
  })

  it('удаляет все ключи по префиксам (per-project)', () => {
    localStorage.setItem(LS_KEY_SOURCES_PREFIX + 'p-1', '{"clientMessages":true}')
    localStorage.setItem(LS_KEY_SOURCES_PREFIX + 'p-2', '{"clientMessages":false}')
    localStorage.setItem(LS_KEY_PANEL_TAB_PREFIX + 'p-1', '"client"')
    localStorage.setItem(LS_KEY_ACTIVE_THREAD_PREFIX + 'p-1', '"thread-1"')

    lsClearPanelKeys()

    expect(localStorage.getItem(LS_KEY_SOURCES_PREFIX + 'p-1')).toBe(null)
    expect(localStorage.getItem(LS_KEY_SOURCES_PREFIX + 'p-2')).toBe(null)
    expect(localStorage.getItem(LS_KEY_PANEL_TAB_PREFIX + 'p-1')).toBe(null)
    expect(localStorage.getItem(LS_KEY_ACTIVE_THREAD_PREFIX + 'p-1')).toBe(null)
  })

  it('НЕ трогает ключи, которые не относятся к панели', () => {
    localStorage.setItem('other-key', 'should-survive')
    localStorage.setItem('app:settings', '{"theme":"dark"}')

    lsClearPanelKeys()

    expect(localStorage.getItem('other-key')).toBe('should-survive')
    expect(localStorage.getItem('app:settings')).toBe('{"theme":"dark"}')
  })

  it('тихо игнорирует ошибки localStorage', () => {
    vi.stubGlobal('localStorage', {
      ...mockStorage,
      removeItem: () => {
        throw new Error('disabled')
      },
    })
    expect(() => lsClearPanelKeys()).not.toThrow()
  })
})

describe('loadPersistedState', () => {
  it('возвращает дефолты для пустого localStorage', () => {
    const state = loadPersistedState()
    expect(state.persistedAiTab).toBe(null)
    expect(state.initialAiSessions).toEqual({})
    expect(state.initialPanelTab).toBe(null)
    // persistedSources имеет дефолтные значения из DEFAULT_AI_SOURCES
    expect(state.persistedSources.clientMessages).toBe(true)
  })

  it('восстанавливает persistedAiTab', () => {
    localStorage.setItem(LS_KEY_AI_TAB, JSON.stringify('chat'))
    const state = loadPersistedState()
    expect(state.persistedAiTab).toBe('chat')
  })

  it('восстанавливает initialPanelTab из panel state', () => {
    localStorage.setItem(LS_KEY_PANEL_STATE, JSON.stringify({ tab: 'client' }))
    const state = loadPersistedState()
    expect(state.initialPanelTab).toBe('client')
  })

  it('строит aiSessions из persistedConversations с глобальными sources', () => {
    localStorage.setItem(
      LS_KEY_CONVERSATIONS,
      JSON.stringify({ 'p-1': 'conv-1', 'p-2': 'conv-2' }),
    )
    localStorage.setItem(
      LS_KEY_SOURCES,
      JSON.stringify({
        clientMessages: false,
        teamMessages: true,
        formData: false,
        documents: true,
        knowledge: null,
      }),
    )

    const state = loadPersistedState()

    expect(Object.keys(state.initialAiSessions)).toEqual(['p-1', 'p-2'])
    expect(state.initialAiSessions['p-1'].activeConversationId).toBe('conv-1')
    expect(state.initialAiSessions['p-1'].sources.teamMessages).toBe(true)
    expect(state.initialAiSessions['p-1'].sources.documents).toBe(true)
    expect(state.initialAiSessions['p-2'].activeConversationId).toBe('conv-2')
  })

  it('per-project sources имеют приоритет над глобальными', () => {
    localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify({ 'p-1': 'conv-1' }))
    localStorage.setItem(
      LS_KEY_SOURCES,
      JSON.stringify({
        clientMessages: false,
        teamMessages: false,
        formData: false,
        documents: false,
        knowledge: null,
      }),
    )
    // Per-project sources с другими значениями
    localStorage.setItem(
      LS_KEY_SOURCES_PREFIX + 'p-1',
      JSON.stringify({
        clientMessages: true,
        teamMessages: true,
        formData: true,
        documents: true,
        knowledge: 'all',
      }),
    )

    const state = loadPersistedState()

    expect(state.initialAiSessions['p-1'].sources.clientMessages).toBe(true)
    expect(state.initialAiSessions['p-1'].sources.knowledge).toBe('all')
  })

  it('aiMessages всегда пустой массив (история не персистится)', () => {
    localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify({ 'p-1': 'conv-1' }))
    const state = loadPersistedState()
    expect(state.initialAiSessions['p-1'].aiMessages).toEqual([])
  })
})
