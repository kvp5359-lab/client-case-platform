/**
 * Тесты для useSidePanelStore — глобального стейта боковой панели.
 *
 * Проверяем все экшены: открытие/закрытие, переключение вкладок,
 * управление контекстом страницы, AI-сессии (per-project), pending
 * данные для прокидывания между панелями, reset при logout.
 *
 * localStorage мокается через vi.stubGlobal — без этого экшены,
 * пишущие в LS, валятся (jsdom в этом проекте имеет неполный
 * localStorage из-за --localstorage-file флага).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSidePanelStore } from './sidePanelStore'
import { DEFAULT_AI_SOURCES } from './sidePanelStore.types'

// ─── Помощник: чистый mock localStorage ───
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

// ─── Полный сброс стора между тестами ───
// Стор создаётся как глобальный singleton при первом импорте.
// setState({...}, true) заменяет всё состояние полностью (без мерджа).
function resetStore() {
  useSidePanelStore.setState(
    {
      panelTab: null,
      lastPanelTab: 'assistant',
      messengerOpen: false,
      aiOpen: false,
      requestedMessengerChannel: null,
      pageContext: { workspaceId: null },
      threadsEnabled: false,
      activeAiTab: null,
      aiSessions: {},
      pendingAiDocuments: [],
      pendingMessengerDocuments: null,
      pendingForwardMessage: null,
      activeChatId: null,
      pendingInitialMessage: null,
    },
    false, // merge=false для частичного обновления state-полей
  )
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  resetStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ============================================================
// Открытие / закрытие панели
// ============================================================

describe('openPanel', () => {
  it('устанавливает panelTab и lastPanelTab', () => {
    useSidePanelStore.getState().openPanel('client')
    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('client')
    expect(state.lastPanelTab).toBe('client')
  })

  it('messengerOpen=true для client/internal', () => {
    useSidePanelStore.getState().openPanel('client')
    expect(useSidePanelStore.getState().messengerOpen).toBe(true)
    expect(useSidePanelStore.getState().aiOpen).toBe(false)
  })

  it('messengerOpen=true для internal', () => {
    useSidePanelStore.getState().openPanel('internal')
    expect(useSidePanelStore.getState().messengerOpen).toBe(true)
  })

  it('aiOpen=true для assistant', () => {
    useSidePanelStore.getState().openPanel('assistant')
    expect(useSidePanelStore.getState().aiOpen).toBe(true)
    expect(useSidePanelStore.getState().messengerOpen).toBe(false)
  })

  it('сохраняет в localStorage panel state', () => {
    useSidePanelStore.getState().openPanel('client')
    const stored = localStorage.getItem('cc:panel-state')
    expect(stored).toBe(JSON.stringify({ tab: 'client' }))
  })

  it('сохраняет per-project tab если pageContext.projectId установлен', () => {
    useSidePanelStore.getState().setContext({ projectId: 'p-1' })
    useSidePanelStore.getState().openPanel('assistant')
    expect(localStorage.getItem('cc:panel-tab:p-1')).toBe(JSON.stringify('assistant'))
  })
})

describe('closePanel', () => {
  it('сбрасывает panelTab в null и обе панели закрывает', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().closePanel()

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe(null)
    expect(state.messengerOpen).toBe(false)
    expect(state.aiOpen).toBe(false)
  })

  it('сохраняет lastPanelTab перед закрытием для восстановления', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().closePanel()
    expect(useSidePanelStore.getState().lastPanelTab).toBe('client')
  })

  it('записывает {tab: null} в localStorage', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().closePanel()
    expect(localStorage.getItem('cc:panel-state')).toBe(JSON.stringify({ tab: null }))
  })
})

describe('togglePanel', () => {
  it('открывает панель если она закрыта', () => {
    useSidePanelStore.getState().togglePanel('client')
    expect(useSidePanelStore.getState().panelTab).toBe('client')
    expect(useSidePanelStore.getState().messengerOpen).toBe(true)
  })

  it('закрывает панель если она открыта на той же вкладке', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().togglePanel('client')

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe(null)
    expect(state.messengerOpen).toBe(false)
  })

  it('переключается на другую вкладку если открыта другая', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().togglePanel('assistant')

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('assistant')
    expect(state.messengerOpen).toBe(false)
    expect(state.aiOpen).toBe(true)
  })
})

describe('openAI', () => {
  it('открывает AI и закрывает мессенджер', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().openAI()

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('assistant')
    expect(state.aiOpen).toBe(true)
    expect(state.messengerOpen).toBe(false)
  })

  it('обновляет pageContext если передан', () => {
    useSidePanelStore.getState().setContext({ workspaceId: 'ws-1' })
    useSidePanelStore.getState().openAI({ projectId: 'p-1' })

    const state = useSidePanelStore.getState()
    expect(state.pageContext.workspaceId).toBe('ws-1')
    expect(state.pageContext.projectId).toBe('p-1')
  })
})

describe('openMessenger', () => {
  it('открывает client канал по умолчанию', () => {
    useSidePanelStore.getState().openMessenger()
    expect(useSidePanelStore.getState().panelTab).toBe('client')
  })

  it('открывает internal канал явно', () => {
    useSidePanelStore.getState().openMessenger('internal')
    expect(useSidePanelStore.getState().panelTab).toBe('internal')
  })

  it('записывает requestedMessengerChannel при явном выборе', () => {
    useSidePanelStore.getState().openMessenger('internal')
    expect(useSidePanelStore.getState().requestedMessengerChannel).toBe('internal')
  })

  it('clearRequestedMessengerChannel сбрасывает поле', () => {
    useSidePanelStore.getState().openMessenger('client')
    useSidePanelStore.getState().clearRequestedMessengerChannel()
    expect(useSidePanelStore.getState().requestedMessengerChannel).toBe(null)
  })
})

// ============================================================
// close/toggle (legacy API)
// ============================================================

describe('close', () => {
  it('close("ai") закрывает только AI если он открыт', () => {
    useSidePanelStore.getState().openPanel('assistant')
    useSidePanelStore.getState().close('ai')

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe(null)
    expect(state.aiOpen).toBe(false)
  })

  it('close("ai") НЕ трогает мессенджер', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().close('ai')

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('client')
    expect(state.messengerOpen).toBe(true)
  })

  it('close("messenger") закрывает только мессенджер', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().close('messenger')
    expect(useSidePanelStore.getState().messengerOpen).toBe(false)
  })

  it('close() без аргумента закрывает всё', () => {
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().close()
    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe(null)
    expect(state.messengerOpen).toBe(false)
    expect(state.aiOpen).toBe(false)
  })
})

describe('toggle', () => {
  it('toggle("ai") открывает AI если ничего не открыто', () => {
    useSidePanelStore.getState().toggle('ai')
    expect(useSidePanelStore.getState().panelTab).toBe('assistant')
  })

  it('toggle("ai") закрывает AI если он открыт', () => {
    useSidePanelStore.getState().openPanel('assistant')
    useSidePanelStore.getState().toggle('ai')
    expect(useSidePanelStore.getState().panelTab).toBe(null)
  })

  it('toggle("messenger") открывает client мессенджер если ничего не открыто', () => {
    useSidePanelStore.getState().toggle('messenger')
    expect(useSidePanelStore.getState().panelTab).toBe('client')
  })

  it('toggle("messenger") закрывает мессенджер если он открыт', () => {
    useSidePanelStore.getState().openPanel('internal')
    useSidePanelStore.getState().toggle('messenger')
    expect(useSidePanelStore.getState().panelTab).toBe(null)
  })
})

// ============================================================
// Контекст страницы
// ============================================================

describe('setContext', () => {
  it('обновляет workspaceId и projectId', () => {
    useSidePanelStore.getState().setContext({ workspaceId: 'ws-1', projectId: 'p-1' })
    const state = useSidePanelStore.getState()
    expect(state.pageContext.workspaceId).toBe('ws-1')
    expect(state.pageContext.projectId).toBe('p-1')
  })

  it('частичное обновление сохраняет старые поля', () => {
    useSidePanelStore.getState().setContext({ workspaceId: 'ws-1', projectId: 'p-1' })
    useSidePanelStore.getState().setContext({ projectId: 'p-2' })

    const state = useSidePanelStore.getState()
    expect(state.pageContext.workspaceId).toBe('ws-1')
    expect(state.pageContext.projectId).toBe('p-2')
  })

  it('при смене projectId восстанавливает lastPanelTab из localStorage', () => {
    localStorage.setItem('cc:panel-tab:p-1', JSON.stringify('internal'))
    useSidePanelStore.getState().setContext({ projectId: 'p-1' })
    expect(useSidePanelStore.getState().lastPanelTab).toBe('internal')
  })

  it('при смене projectId восстанавливает activeChatId из localStorage', () => {
    localStorage.setItem('cc:active-thread:p-1', JSON.stringify('chat-42'))
    useSidePanelStore.getState().setContext({ projectId: 'p-1' })
    expect(useSidePanelStore.getState().activeChatId).toBe('chat-42')
  })

  it('повторная установка того же projectId не меняет activeChatId', () => {
    useSidePanelStore.getState().setContext({ projectId: 'p-1' })
    useSidePanelStore.setState({ activeChatId: 'manually-set' })
    useSidePanelStore.getState().setContext({ projectId: 'p-1' }) // тот же
    expect(useSidePanelStore.getState().activeChatId).toBe('manually-set')
  })
})

describe('setThreadsEnabled', () => {
  it('меняет флаг threadsEnabled', () => {
    useSidePanelStore.getState().setThreadsEnabled(true)
    expect(useSidePanelStore.getState().threadsEnabled).toBe(true)

    useSidePanelStore.getState().setThreadsEnabled(false)
    expect(useSidePanelStore.getState().threadsEnabled).toBe(false)
  })
})

describe('setActiveAiTab', () => {
  it('меняет вкладку и сохраняет в localStorage', () => {
    useSidePanelStore.getState().setActiveAiTab('chat')
    expect(useSidePanelStore.getState().activeAiTab).toBe('chat')
    expect(localStorage.getItem('cc:ai-tab')).toBe(JSON.stringify('chat'))
  })
})

// ============================================================
// AI sessions (per-project)
// ============================================================

describe('getAiSession', () => {
  it('создаёт сессию с дефолтами для нового проекта', () => {
    const session = useSidePanelStore.getState().getAiSession('p-new')

    expect(session.activeConversationId).toBe(null)
    expect(session.aiMessages).toEqual([])
    expect(session.sources).toEqual(DEFAULT_AI_SOURCES)
  })

  it('возвращает существующую сессию из state', () => {
    useSidePanelStore.setState({
      aiSessions: {
        'p-1': {
          activeConversationId: 'conv-42',
          aiMessages: [],
          sources: { ...DEFAULT_AI_SOURCES, documents: true },
        },
      },
    })

    const session = useSidePanelStore.getState().getAiSession('p-1')
    expect(session.activeConversationId).toBe('conv-42')
    expect(session.sources.documents).toBe(true)
  })

  it('берёт sources из localStorage если в state нет сессии', () => {
    localStorage.setItem(
      'cc:ai-sources',
      JSON.stringify({
        clientMessages: false,
        teamMessages: true,
        formData: false,
        documents: true,
        knowledge: 'project',
      }),
    )

    const session = useSidePanelStore.getState().getAiSession('p-1')
    expect(session.sources.teamMessages).toBe(true)
    expect(session.sources.documents).toBe(true)
    expect(session.sources.knowledge).toBe('project')
  })

  it('per-project sources имеют приоритет над глобальными', () => {
    localStorage.setItem(
      'cc:ai-sources',
      JSON.stringify({ ...DEFAULT_AI_SOURCES, documents: true }),
    )
    localStorage.setItem(
      'cc:ai-sources:p-1',
      JSON.stringify({ ...DEFAULT_AI_SOURCES, documents: false, formData: true }),
    )

    const session = useSidePanelStore.getState().getAiSession('p-1')
    expect(session.sources.documents).toBe(false) // из per-project
    expect(session.sources.formData).toBe(true)
  })

  it('берёт activeConversationId из conversations map', () => {
    localStorage.setItem('cc:ai-conversations', JSON.stringify({ 'p-1': 'conv-42', 'p-2': 'conv-99' }))

    expect(useSidePanelStore.getState().getAiSession('p-1').activeConversationId).toBe('conv-42')
    expect(useSidePanelStore.getState().getAiSession('p-2').activeConversationId).toBe('conv-99')
  })
})

describe('updateAiSession', () => {
  it('создаёт сессию если её ещё не было', () => {
    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: 'conv-1' })

    const sessions = useSidePanelStore.getState().aiSessions
    expect(sessions['p-1']).toBeDefined()
    expect(sessions['p-1'].activeConversationId).toBe('conv-1')
  })

  it('мерджит patch с существующей сессией', () => {
    useSidePanelStore.setState({
      aiSessions: {
        'p-1': {
          activeConversationId: 'old',
          aiMessages: [{ id: '1', role: 'user', content: 'hi', created_at: '2026-01-01' }],
          sources: { ...DEFAULT_AI_SOURCES },
        },
      },
    })

    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: 'new' })

    const session = useSidePanelStore.getState().aiSessions['p-1']
    expect(session.activeConversationId).toBe('new')
    // aiMessages должны сохраниться
    expect(session.aiMessages).toHaveLength(1)
  })

  it('сохраняет sources в localStorage (и per-project, и глобальные)', () => {
    const newSources = { ...DEFAULT_AI_SOURCES, documents: true, formData: true }
    useSidePanelStore.getState().updateAiSession('p-1', { sources: newSources })

    expect(localStorage.getItem('cc:ai-sources:p-1')).toBe(JSON.stringify(newSources))
    expect(localStorage.getItem('cc:ai-sources')).toBe(JSON.stringify(newSources))
  })

  it('сохраняет activeConversationId в conversations map', () => {
    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: 'conv-1' })
    useSidePanelStore.getState().updateAiSession('p-2', { activeConversationId: 'conv-2' })

    const stored = JSON.parse(localStorage.getItem('cc:ai-conversations') ?? '{}')
    expect(stored).toEqual({ 'p-1': 'conv-1', 'p-2': 'conv-2' })
  })

  it('удаляет conversation из map при сбросе activeConversationId', () => {
    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: 'conv-1' })
    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: null })

    const stored = JSON.parse(localStorage.getItem('cc:ai-conversations') ?? '{}')
    expect(stored).not.toHaveProperty('p-1')
  })
})

// ============================================================
// Pending данные (документы, форварды)
// ============================================================

describe('openAssistantWithDocuments', () => {
  it('открывает ассистент и кладёт документы в pendingAiDocuments', () => {
    const docs = [
      { id: 'd-1', name: 'Договор.pdf' },
      { id: 'd-2', name: 'Акт.docx' },
    ]
    useSidePanelStore.getState().openAssistantWithDocuments(docs)

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('assistant')
    expect(state.aiOpen).toBe(true)
    expect(state.pendingAiDocuments).toEqual(docs)
  })

  it('clearPendingAiDocuments очищает массив', () => {
    useSidePanelStore.getState().openAssistantWithDocuments([{ id: 'd-1', name: 'X' }])
    useSidePanelStore.getState().clearPendingAiDocuments()
    expect(useSidePanelStore.getState().pendingAiDocuments).toEqual([])
  })
})

describe('sendDocumentsToMessenger', () => {
  it('открывает client мессенджер с документами', () => {
    useSidePanelStore.getState().sendDocumentsToMessenger(['d-1', 'd-2'], 'client')

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe('client')
    expect(state.messengerOpen).toBe(true)
    expect(state.requestedMessengerChannel).toBe('client')
    expect(state.pendingMessengerDocuments).toEqual({ ids: ['d-1', 'd-2'], channel: 'client' })
  })

  it('открывает internal мессенджер', () => {
    useSidePanelStore.getState().sendDocumentsToMessenger(['d-1'], 'internal')
    expect(useSidePanelStore.getState().panelTab).toBe('internal')
  })

  it('clearPendingMessengerDocuments очищает', () => {
    useSidePanelStore.getState().sendDocumentsToMessenger(['d-1'], 'client')
    useSidePanelStore.getState().clearPendingMessengerDocuments()
    expect(useSidePanelStore.getState().pendingMessengerDocuments).toBe(null)
  })
})

describe('forwardMessageToChannel', () => {
  it('сохраняет pendingForwardMessage и переключает activeChatId', () => {
    const msg = {
      senderName: 'Иван',
      content: 'Привет',
      targetChatId: 'chat-42',
    }
    useSidePanelStore.getState().forwardMessageToChannel(msg)

    const state = useSidePanelStore.getState()
    expect(state.pendingForwardMessage).toEqual(msg)
    expect(state.activeChatId).toBe('chat-42')
    expect(state.messengerOpen).toBe(true)
    expect(state.aiOpen).toBe(false)
  })

  it('clearPendingForwardMessage очищает', () => {
    useSidePanelStore.getState().forwardMessageToChannel({
      senderName: 'X',
      content: 'Y',
      targetChatId: 'c-1',
    })
    useSidePanelStore.getState().clearPendingForwardMessage()
    expect(useSidePanelStore.getState().pendingForwardMessage).toBe(null)
  })
})

describe('setPendingInitialMessage', () => {
  it('сохраняет и сбрасывает pendingInitialMessage', () => {
    const msg = {
      threadId: 't-1',
      html: '<p>hi</p>',
      files: [],
      isEmail: false,
      senderName: 'Иван',
    }
    useSidePanelStore.getState().setPendingInitialMessage(msg)
    expect(useSidePanelStore.getState().pendingInitialMessage).toEqual(msg)

    useSidePanelStore.getState().setPendingInitialMessage(null)
    expect(useSidePanelStore.getState().pendingInitialMessage).toBe(null)
  })
})

// ============================================================
// openChat / restoreActiveChatId
// ============================================================

describe('openChat', () => {
  it('устанавливает activeChatId и открывает client', () => {
    useSidePanelStore.getState().openChat('chat-1', 'client')

    const state = useSidePanelStore.getState()
    expect(state.activeChatId).toBe('chat-1')
    expect(state.panelTab).toBe('client')
    expect(state.messengerOpen).toBe(true)
  })

  it('открывает internal канал', () => {
    useSidePanelStore.getState().openChat('chat-1', 'internal')
    expect(useSidePanelStore.getState().panelTab).toBe('internal')
  })

  it('сохраняет activeChatId в localStorage если есть projectId', () => {
    useSidePanelStore.getState().setContext({ projectId: 'p-1' })
    useSidePanelStore.getState().openChat('chat-1', 'client')
    expect(localStorage.getItem('cc:active-thread:p-1')).toBe(JSON.stringify('chat-1'))
  })

  it('сохраняет panel state в localStorage', () => {
    useSidePanelStore.getState().openChat('chat-1', 'internal')
    expect(localStorage.getItem('cc:panel-state')).toBe(JSON.stringify({ tab: 'internal' }))
  })
})

describe('restoreActiveChatId', () => {
  it('восстанавливает activeChatId из localStorage', () => {
    localStorage.setItem('cc:active-thread:p-1', JSON.stringify('chat-99'))
    useSidePanelStore.getState().restoreActiveChatId('p-1')
    expect(useSidePanelStore.getState().activeChatId).toBe('chat-99')
  })

  it('не меняет state если в localStorage ничего нет', () => {
    useSidePanelStore.setState({ activeChatId: 'before' })
    useSidePanelStore.getState().restoreActiveChatId('p-no-data')
    expect(useSidePanelStore.getState().activeChatId).toBe('before')
  })
})

// ============================================================
// Reset (logout)
// ============================================================

describe('reset', () => {
  it('сбрасывает все поля стора к дефолтам', () => {
    // Накатываем кучу состояния
    useSidePanelStore.getState().openPanel('client')
    useSidePanelStore.getState().setContext({ workspaceId: 'ws-1', projectId: 'p-1' })
    useSidePanelStore.getState().setThreadsEnabled(true)
    useSidePanelStore.getState().setActiveAiTab('chat')
    useSidePanelStore.getState().updateAiSession('p-1', { activeConversationId: 'conv-1' })
    useSidePanelStore.getState().openAssistantWithDocuments([{ id: 'd-1', name: 'X' }])

    useSidePanelStore.getState().reset()

    const state = useSidePanelStore.getState()
    expect(state.panelTab).toBe(null)
    expect(state.lastPanelTab).toBe('assistant')
    expect(state.messengerOpen).toBe(false)
    expect(state.aiOpen).toBe(false)
    expect(state.pageContext).toEqual({ workspaceId: null })
    expect(state.threadsEnabled).toBe(false)
    expect(state.activeAiTab).toBe(null)
    expect(state.aiSessions).toEqual({})
    expect(state.pendingAiDocuments).toEqual([])
    expect(state.pendingMessengerDocuments).toBe(null)
    expect(state.pendingForwardMessage).toBe(null)
    expect(state.activeChatId).toBe(null)
    expect(state.pendingInitialMessage).toBe(null)
  })

  it('очищает все ключи панели в localStorage (защита от утечки между пользователями)', () => {
    // Заполняем localStorage всеми типами ключей панели
    localStorage.setItem('cc:ai-sources', '{"foo":"bar"}')
    localStorage.setItem('cc:ai-sources:p-1', '{"foo":"bar"}')
    localStorage.setItem('cc:ai-conversations', '{}')
    localStorage.setItem('cc:ai-tab', '"chat"')
    localStorage.setItem('cc:panel-state', '{"tab":"client"}')
    localStorage.setItem('cc:panel-tab:p-1', '"assistant"')
    localStorage.setItem('cc:active-thread:p-1', '"chat-1"')
    // Несвязанный ключ должен выжить
    localStorage.setItem('app:settings', '{"theme":"dark"}')

    useSidePanelStore.getState().reset()

    expect(localStorage.getItem('cc:ai-sources')).toBe(null)
    expect(localStorage.getItem('cc:ai-sources:p-1')).toBe(null)
    expect(localStorage.getItem('cc:ai-conversations')).toBe(null)
    expect(localStorage.getItem('cc:ai-tab')).toBe(null)
    expect(localStorage.getItem('cc:panel-state')).toBe(null)
    expect(localStorage.getItem('cc:panel-tab:p-1')).toBe(null)
    expect(localStorage.getItem('cc:active-thread:p-1')).toBe(null)
    // Несвязанный — выжил
    expect(localStorage.getItem('app:settings')).toBe('{"theme":"dark"}')
  })
})
