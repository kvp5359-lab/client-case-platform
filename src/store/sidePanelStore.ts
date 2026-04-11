"use client"

/**
 * Side Panel Store — глобальный стейт для единой боковой панели
 *
 * Панель имеет три вкладки:
 * - client — мессенджер (клиентский канал)
 * - internal — мессенджер (командный канал)
 * - assistant — AI-ассистент
 *
 * panelTab = null означает, что панель закрыта.
 *
 * pageContext — контекст текущей страницы (projectId, templateId), устанавливается из ProjectPage.
 * aiSession — состояние AI-ассистента, сохраняется при закрытии/открытии панели (per project).
 *
 * Часть состояния персистится в localStorage:
 * - aiSources (глобальные настройки источников)
 * - activeConversationId per project
 * - activeAiTab
 */

import { create } from 'zustand'
import type { AiSources } from '@/services/api/messenger/messengerAiService'
import type { SidePanelStore, PanelTab, AiSessionState } from './sidePanelStore.types'
import { DEFAULT_AI_SOURCES } from './sidePanelStore.types'
import {
  lsGet,
  lsSet,
  loadPersistedState,
  LS_KEY_SOURCES,
  LS_KEY_SOURCES_PREFIX,
  LS_KEY_CONVERSATIONS,
  LS_KEY_AI_TAB,
  LS_KEY_PANEL_TAB_PREFIX,
  LS_KEY_PANEL_STATE,
  LS_KEY_ACTIVE_THREAD_PREFIX,
} from './sidePanelStore.localStorage'

export type { PanelTab, SidePanelStore }
export type {
  PanelType,
  AiMessage,
  PendingMessengerDocuments,
  PendingForwardMessage,
  PendingInitialMessage,
  AiSessionState,
} from './sidePanelStore.types'

const {
  persistedAiTab,
  initialAiSessions,
  initialPanelTab: _initialPanelTab,
} = loadPersistedState()

export const useSidePanelStore = create<SidePanelStore>((set, get) => ({
  panelTab: _initialPanelTab,
  lastPanelTab: _initialPanelTab ?? 'assistant',
  messengerOpen: _initialPanelTab === 'client' || _initialPanelTab === 'internal',
  aiOpen: _initialPanelTab === 'assistant',
  requestedMessengerChannel: null,

  pageContext: { workspaceId: null },
  threadsEnabled: false,
  activeAiTab: persistedAiTab,
  aiSessions: initialAiSessions,
  pendingAiDocuments: [],
  pendingMessengerDocuments: null,
  pendingForwardMessage: null,
  activeChatId: null,

  openPanel: (tab) => {
    const { pageContext } = get()
    if (pageContext.projectId) {
      lsSet(LS_KEY_PANEL_TAB_PREFIX + pageContext.projectId, tab)
    }
    lsSet(LS_KEY_PANEL_STATE, { tab })
    set({
      panelTab: tab,
      lastPanelTab: tab,
      messengerOpen: tab === 'client' || tab === 'internal',
      aiOpen: tab === 'assistant',
    })
  },

  closePanel: () => {
    const current = get().panelTab
    lsSet(LS_KEY_PANEL_STATE, { tab: null })
    set({
      panelTab: null,
      messengerOpen: false,
      aiOpen: false,
      ...(current ? { lastPanelTab: current } : {}),
    })
  },

  togglePanel: (tab) => {
    const state = get()
    if (state.pageContext.projectId) {
      lsSet(LS_KEY_PANEL_TAB_PREFIX + state.pageContext.projectId, tab)
    }
    if (state.panelTab === tab) {
      lsSet(LS_KEY_PANEL_STATE, { tab: null })
      set({ panelTab: null, messengerOpen: false, aiOpen: false, lastPanelTab: tab })
    } else {
      lsSet(LS_KEY_PANEL_STATE, { tab })
      set({
        panelTab: tab,
        lastPanelTab: tab,
        messengerOpen: tab === 'client' || tab === 'internal',
        aiOpen: tab === 'assistant',
      })
    }
  },

  openAI: (ctx) => {
    set((state) => ({
      panelTab: 'assistant',
      messengerOpen: false,
      aiOpen: true,
      ...(ctx ? { pageContext: { ...state.pageContext, ...ctx } } : {}),
    }))
  },

  openMessenger: (channel) => {
    const tab: PanelTab = channel === 'internal' ? 'internal' : 'client'
    set({
      panelTab: tab,
      messengerOpen: true,
      aiOpen: false,
      ...(channel ? { requestedMessengerChannel: channel } : {}),
    })
  },

  clearRequestedMessengerChannel: () => {
    set({ requestedMessengerChannel: null })
  },

  close: (panel) => {
    const state = get()
    if (panel === 'ai') {
      if (state.panelTab === 'assistant') {
        set({ panelTab: null, messengerOpen: false, aiOpen: false })
      }
    } else if (panel === 'messenger') {
      if (state.panelTab === 'client' || state.panelTab === 'internal') {
        set({ panelTab: null, messengerOpen: false, aiOpen: false })
      }
    } else {
      set({ panelTab: null, messengerOpen: false, aiOpen: false })
    }
  },

  toggle: (type) => {
    const state = get()
    if (type === 'ai') {
      if (state.panelTab === 'assistant') {
        set({ panelTab: null, messengerOpen: false, aiOpen: false })
      } else {
        state.openAI()
      }
    } else {
      if (state.panelTab === 'client' || state.panelTab === 'internal') {
        set({ panelTab: null, messengerOpen: false, aiOpen: false })
      } else {
        state.openMessenger()
      }
    }
  },

  setContext: (ctx) =>
    set((state) => {
      const next: Partial<SidePanelStore> = {
        pageContext: { ...state.pageContext, ...ctx },
      }
      if (ctx.projectId && ctx.projectId !== state.pageContext.projectId) {
        const saved = lsGet<PanelTab | null>(LS_KEY_PANEL_TAB_PREFIX + ctx.projectId, null)
        if (saved) next.lastPanelTab = saved
        // Восстанавливаем последний открытый чат для проекта сразу при смене контекста
        const savedChat = lsGet<string | null>(LS_KEY_ACTIVE_THREAD_PREFIX + ctx.projectId, null)
        next.activeChatId = savedChat
      }
      return next
    }),

  setThreadsEnabled: (enabled) => set({ threadsEnabled: enabled }),

  setActiveAiTab: (tab) => {
    lsSet(LS_KEY_AI_TAB, tab)
    set({ activeAiTab: tab })
  },

  getAiSession: (projectId) => {
    const sessions = get().aiSessions
    if (sessions[projectId]) return sessions[projectId]
    const projectSources = lsGet<AiSources | null>(LS_KEY_SOURCES_PREFIX + projectId, null)
    const sources = projectSources ?? lsGet<AiSources>(LS_KEY_SOURCES, DEFAULT_AI_SOURCES)
    const convs = lsGet<Record<string, string>>(LS_KEY_CONVERSATIONS, {})
    return {
      activeConversationId: convs[projectId] ?? null,
      aiMessages: [],
      sources: { ...sources },
    }
  },

  updateAiSession: (projectId, patch) => {
    set((state) => {
      const prev: AiSessionState = state.aiSessions[projectId] ?? {
        activeConversationId: null,
        aiMessages: [],
        sources: { ...DEFAULT_AI_SOURCES },
      }
      const next = { ...prev, ...patch }

      if (patch.sources) {
        lsSet(LS_KEY_SOURCES_PREFIX + projectId, patch.sources)
        lsSet(LS_KEY_SOURCES, patch.sources)
      }

      if ('activeConversationId' in patch) {
        const convs = lsGet<Record<string, string>>(LS_KEY_CONVERSATIONS, {})
        if (patch.activeConversationId) {
          convs[projectId] = patch.activeConversationId
        } else {
          delete convs[projectId]
        }
        lsSet(LS_KEY_CONVERSATIONS, convs)
      }

      return {
        aiSessions: {
          ...state.aiSessions,
          [projectId]: next,
        },
      }
    })
  },

  openAssistantWithDocuments: (docs) => {
    set({
      panelTab: 'assistant',
      messengerOpen: false,
      aiOpen: true,
      pendingAiDocuments: docs,
    })
  },

  clearPendingAiDocuments: () => set({ pendingAiDocuments: [] }),

  sendDocumentsToMessenger: (ids, channel) => {
    set({
      panelTab: channel === 'internal' ? 'internal' : 'client',
      messengerOpen: true,
      aiOpen: false,
      requestedMessengerChannel: channel,
      pendingMessengerDocuments: { ids, channel },
    })
  },
  clearPendingMessengerDocuments: () => set({ pendingMessengerDocuments: null }),

  forwardMessageToChannel: (msg) => {
    set({
      messengerOpen: true,
      aiOpen: false,
      activeChatId: msg.targetChatId,
      pendingForwardMessage: msg,
    })
  },
  clearPendingForwardMessage: () => set({ pendingForwardMessage: null }),

  pendingInitialMessage: null,
  setPendingInitialMessage: (msg) => set({ pendingInitialMessage: msg }),

  openChat: (chatId, channel) => {
    const tab: PanelTab = channel === 'internal' ? 'internal' : 'client'
    lsSet(LS_KEY_PANEL_STATE, { tab })
    const projectId = get().pageContext.projectId
    if (projectId) {
      lsSet(LS_KEY_ACTIVE_THREAD_PREFIX + projectId, chatId)
    }
    set({
      panelTab: tab,
      activeChatId: chatId,
      messengerOpen: true,
      aiOpen: false,
    })
  },

  restoreActiveChatId: (projectId: string) => {
    const chatId = lsGet<string | null>(LS_KEY_ACTIVE_THREAD_PREFIX + projectId, null)
    if (chatId) {
      set({ activeChatId: chatId })
    }
  },
}))
