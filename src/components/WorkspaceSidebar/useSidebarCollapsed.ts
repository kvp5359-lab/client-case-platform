"use client"

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'cc:sidebar-collapsed'

export function useSidebarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Читаем из localStorage только после mount, чтобы избежать SSR-mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage недоступен на сервере; читаем после mount чтобы избежать SSR/CSR-mismatch
      if (saved === '1') setIsCollapsed(true)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  return { isCollapsed, toggle }
}
