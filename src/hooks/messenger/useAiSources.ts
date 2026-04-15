"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import type { AiSources, ChatScope } from '@/services/api/messenger/messengerAiService'

export interface UseAiSourcesOptions {
  initialSources?: AiSources
  onSourcesChange?: (sources: AiSources) => void
}

const DEFAULT_SOURCES: AiSources = {
  chats: { mode: 'all', threadIds: [] },
  formData: false,
  documents: false,
  knowledge: null,
}

export function useAiSources(options?: UseAiSourcesOptions) {
  const onSourcesChangeRef = useRef(options?.onSourcesChange)
  useEffect(() => {
    onSourcesChangeRef.current = options?.onSourcesChange
  }, [options?.onSourcesChange])

  const [sources, setSourcesRaw] = useState<AiSources>(
    () => options?.initialSources ?? DEFAULT_SOURCES,
  )

  // Notify parent about sources changes outside of render
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    onSourcesChangeRef.current?.(sources)
  }, [sources])

  const setSources = useCallback((updater: AiSources | ((prev: AiSources) => AiSources)) => {
    setSourcesRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return next
    })
  }, [])

  /** Переключатель для бинарных источников: formData / documents. */
  const toggleSource = useCallback((key: 'formData' | 'documents') => {
    setSources((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [setSources])

  /** Toggle knowledge: project | all | null. */
  const setKnowledge = useCallback((value: 'project' | 'all' | null) => {
    setSources((prev) => ({ ...prev, knowledge: value }))
  }, [setSources])

  /** Заменить скоуп чатов целиком. */
  const setChatScope = useCallback((scope: ChatScope) => {
    setSources((prev) => ({ ...prev, chats: scope }))
  }, [setSources])

  const disableAllSources = useCallback(() => {
    setSources({
      chats: { mode: 'selected', threadIds: [] },
      formData: false,
      documents: false,
      knowledge: null,
    })
  }, [setSources])

  return {
    sources,
    setSources,
    toggleSource,
    setKnowledge,
    setChatScope,
    disableAllSources,
  }
}
