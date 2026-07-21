import { useState, useRef, useCallback } from 'react'

const MIN_EDITOR_HEIGHT = 36
// Запас под тулбар композера + чуть места сверху: поле не растёт выше окна.
const VIEWPORT_RESERVE = 150
// Базовая (минимальная) высота поля — ~1 строка. Перетаскивание ручки её меняет,
// поэтому пустое поле тоже становится выше (высота НЕ зависит от содержимого).
const DEFAULT_EDITOR_HEIGHT = 40
// Потолок авто-роста от контента, если базовая высота меньше него.
const DEFAULT_MAX_HEIGHT = 255

/** Верхняя граница высоты поля — по высоте окна (минус запас), без фикс-потолка. */
function maxEditorHeight(): number {
  if (typeof window === 'undefined') return 600
  return Math.max(MIN_EDITOR_HEIGHT, window.innerHeight - VIEWPORT_RESERVE)
}

export function useEditorResizer() {
  const [editorHeight, setEditorHeight] = useState(DEFAULT_EDITOR_HEIGHT)
  const isDraggingResizer = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(DEFAULT_EDITOR_HEIGHT)

  const handleResizerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDraggingResizer.current = true
      dragStartY.current = e.clientY
      dragStartHeight.current = editorHeight

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingResizer.current) return
        const delta = dragStartY.current - ev.clientY
        const newHeight = Math.min(
          maxEditorHeight(),
          Math.max(MIN_EDITOR_HEIGHT, dragStartHeight.current + delta),
        )
        setEditorHeight(newHeight)
      }

      const onMouseUp = () => {
        isDraggingResizer.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [editorHeight],
  )

  // min = заданная ручкой базовая высота (пустое поле такой высоты);
  // max = не меньше базовой, иначе авто-рост до DEFAULT_MAX_HEIGHT и скролл.
  return {
    editorMinHeight: editorHeight,
    editorMaxHeight: Math.max(editorHeight, DEFAULT_MAX_HEIGHT),
    handleResizerMouseDown,
  }
}
