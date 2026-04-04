import { useState, useRef, useCallback } from 'react'

const MIN_EDITOR_HEIGHT = 36
const MAX_EDITOR_HEIGHT = 600
const DEFAULT_EDITOR_HEIGHT = 255

export function useEditorResizer() {
  const [editorMaxHeight, setEditorMaxHeight] = useState(DEFAULT_EDITOR_HEIGHT)
  const isDraggingResizer = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(DEFAULT_EDITOR_HEIGHT)

  const handleResizerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDraggingResizer.current = true
      dragStartY.current = e.clientY
      dragStartHeight.current = editorMaxHeight

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingResizer.current) return
        const delta = dragStartY.current - ev.clientY
        const newHeight = Math.min(
          MAX_EDITOR_HEIGHT,
          Math.max(MIN_EDITOR_HEIGHT, dragStartHeight.current + delta),
        )
        setEditorMaxHeight(newHeight)
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
    [editorMaxHeight],
  )

  return { editorMaxHeight, handleResizerMouseDown }
}
