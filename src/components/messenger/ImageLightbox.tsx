import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

const ZOOM_STEP = 0.25
const ZOOM_MIN = 0.25
const ZOOM_MAX = 5

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1)

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
  const zoomReset = () => setZoom(1)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') zoomIn()
      if (e.key === '-') zoomOut()
      if (e.key === '0') zoomReset()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Колёсиком мыши с Ctrl/Cmd — зум (как привычно в браузерах/галереях)
  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }

  // Рендерим в document.body через портал — иначе `fixed inset-0` внутри
  // предков с `transform` (TaskPanel, .side-panel) привязывается к этому
  // предку, а не к viewport, и лайтбокс зажимается в границы боковой панели.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 overflow-auto"
      onClick={onClose}
      onWheel={handleWheel}
    >
      {/* Панель управления — поверх всего */}
      <div
        className="absolute top-4 right-4 flex items-center gap-1 bg-black/40 rounded-lg px-1 py-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Уменьшить"
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          onClick={zoomReset}
          aria-label="Сбросить масштаб"
          className="px-2 py-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors text-xs font-medium min-w-[48px]"
          title="Сбросить (0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Увеличить"
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button
          onClick={zoomReset}
          disabled={zoom === 1}
          aria-label="К исходному размеру"
          title="К исходному размеру (0)"
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Контейнер с картинкой — при зуме > 1 появляется скролл */}
      <div
        className="flex items-center justify-center min-w-full min-h-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={800}
          height={600}
          unoptimized
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg transition-transform duration-100 select-none"
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  )
}
