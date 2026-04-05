"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import type { AiSources } from '@/services/api/messengerAiService'

export interface UseAiSourcesOptions {
  initialSources?: AiSources
  onSourcesChange?: (sources: AiSources) => void
}

export function useAiSources(options?: UseAiSourcesOptions) {
  const onSourcesChangeRef = useRef(options?.onSourcesChange)
  useEffect(() => {
    onSourcesChangeRef.current = options?.onSourcesChange
  }, [options?.onSourcesChange])

  const [sources, setSourcesRaw] = useState<AiSources>(
    () =>
      options?.initialSources ?? {
        clientMessages: true,
        teamMessages: false,
        formData: false,
        documents: false,
        knowledge: null,
      },
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

  const toggleSource = useCallback((key: keyof AiSources) => {
    setSources((prev) => {
      if (key === 'knowledge') return prev
      return { ...prev, [key]: !prev[key] }
    })
  }, [])

  /** Toggle knowledge: project → all → off (null) */
  const setKnowledge = useCallback((value: 'project' | 'all' | null) => {
    setSources((prev) => ({ ...prev, knowledge: value }))
  }, [])

  const disableAllSources = useCallback(() => {
    setSources({
      clientMessages: false,
      teamMessages: false,
      formData: false,
      documents: false,
      knowledge: null,
    })
  }, [])

  return {
    sources,
    setSources,
    toggleSource,
    setKnowledge,
    disableAllSources,
  }
}
