import type { AiSources } from '@/services/api/messenger/messengerAiService'
import type { PanelTab, AiSessionState } from './sidePanelStore.types'
import { DEFAULT_AI_SOURCES } from './sidePanelStore.types'

export const LS_KEY_SOURCES = 'cc:ai-sources'
export const LS_KEY_SOURCES_PREFIX = 'cc:ai-sources:'
export const LS_KEY_CONVERSATIONS = 'cc:ai-conversations'
export const LS_KEY_AI_TAB = 'cc:ai-tab'
export const LS_KEY_PANEL_TAB_PREFIX = 'cc:panel-tab:'
export const LS_KEY_PANEL_STATE = 'cc:panel-state'
export const LS_KEY_ACTIVE_THREAD_PREFIX = 'cc:active-thread:'

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota exceeded — ignore silently
  }
}

/**
 * Полная очистка всех ключей панели из localStorage — вызывается при logout.
 * Удаляет фиксированные ключи и все ключи по префиксам (per-project).
 */
export function lsClearPanelKeys() {
  try {
    localStorage.removeItem(LS_KEY_SOURCES)
    localStorage.removeItem(LS_KEY_CONVERSATIONS)
    localStorage.removeItem(LS_KEY_AI_TAB)
    localStorage.removeItem(LS_KEY_PANEL_STATE)
    const prefixes = [LS_KEY_SOURCES_PREFIX, LS_KEY_PANEL_TAB_PREFIX, LS_KEY_ACTIVE_THREAD_PREFIX]
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && prefixes.some((p) => key.startsWith(p))) {
        toRemove.push(key)
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // localStorage недоступен — игнорируем
  }
}

function buildInitialAiSessions(
  persistedConversations: Record<string, string>,
  persistedSources: AiSources,
): Record<string, AiSessionState> {
  const sessions: Record<string, AiSessionState> = {}
  for (const [pid, convId] of Object.entries(persistedConversations)) {
    const projectSources = lsGet<AiSources | null>(LS_KEY_SOURCES_PREFIX + pid, null)
    sessions[pid] = {
      activeConversationId: convId,
      aiMessages: [],
      sources: projectSources ?? { ...persistedSources },
    }
  }
  return sessions
}

export function loadPersistedState() {
  const persistedSources = lsGet<AiSources>(LS_KEY_SOURCES, DEFAULT_AI_SOURCES)
  const persistedConversations = lsGet<Record<string, string>>(LS_KEY_CONVERSATIONS, {})
  const persistedAiTab = lsGet<string | null>(LS_KEY_AI_TAB, null)
  const persistedPanelState = lsGet<{ tab: PanelTab | null }>(LS_KEY_PANEL_STATE, { tab: null })
  const initialAiSessions = buildInitialAiSessions(persistedConversations, persistedSources)

  return {
    persistedSources,
    persistedAiTab,
    initialAiSessions,
    initialPanelTab: persistedPanelState.tab,
  }
}
