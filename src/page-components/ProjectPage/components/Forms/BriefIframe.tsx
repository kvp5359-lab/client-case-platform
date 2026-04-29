"use client"

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

/**
 * Раньше iframe был position:fixed — растягивался от своего якоря до правого
 * нижнего угла окна, чтобы занять всё доступное место. Это ломалось в двух
 * сценариях: (1) на проекте с двумя анкетами fixed-iframe накладывался на поля
 * соседней анкеты ниже; (2) ширина считалась от window.innerWidth и вылезала
 * за правый отступ контента. Сейчас рендеримся в нормальном потоке: ширина —
 * 100% контейнера, высота — остаток вьюпорта от текущей позиции (через
 * ResizeObserver, чтобы реагировать на сворачивание/разворачивание соседей).
 */
export function BriefIframe({ briefSheetId }: { briefSheetId: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const top = el.getBoundingClientRect().top
      setHeight(Math.max(400, window.innerHeight - top - 16))
    }
    update()
    const t = setTimeout(update, 50)
    window.addEventListener('resize', update)
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
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
  )
}
