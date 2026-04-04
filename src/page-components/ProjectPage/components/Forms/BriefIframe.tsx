"use client"

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useSidePanelStore } from '@/store/sidePanelStore'

export function BriefIframe({ briefSheetId }: { briefSheetId: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ left: number; top: number; width: number } | null>(null)
  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return

    const update = () => {
      const r = el.getBoundingClientRect()
      const scrollContainer = el.closest('[data-project-scroll]') as HTMLElement | null
      const rightEdge = scrollContainer
        ? scrollContainer.getBoundingClientRect().right
        : window.innerWidth
      setDims({ left: r.left, top: r.top, width: rightEdge - r.left })
    }

    update()
    const t1 = setTimeout(update, 50)
    window.addEventListener('resize', update)
    return () => {
      clearTimeout(t1)
      window.removeEventListener('resize', update)
    }
  }, [sidePanelOpen])

  return (
    <>
      <div ref={anchorRef} className="h-1 -mb-1" />
      {dims && (
        <div
          style={{
            position: 'fixed',
            left: dims.left,
            top: dims.top,
            width: dims.width,
            bottom: 0,
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40 mb-3" />
              <span className="text-sm text-muted-foreground">Загрузка таблицы...</span>
            </div>
          )}
          <iframe
            src={`https://docs.google.com/spreadsheets/d/${briefSheetId}/edit?rm=minimal`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="clipboard-write"
            onLoad={() => setIsLoading(false)}
            title="Бриф (Google Таблица)"
          />
        </div>
      )}
    </>
  )
}
