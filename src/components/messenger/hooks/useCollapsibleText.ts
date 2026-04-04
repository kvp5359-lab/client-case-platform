import { useState, useRef, useLayoutEffect } from 'react'

const OVERFLOW_THRESHOLD = 420
const MAX_COLLAPSED_HEIGHT = 210

export function useCollapsibleText(content: string) {
  const textRef = useRef<HTMLDivElement>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    setIsOverflowing(el.scrollHeight > OVERFLOW_THRESHOLD)
  }, [content])

  return {
    textRef,
    isCollapsed,
    isOverflowing,
    maxCollapsedHeight: MAX_COLLAPSED_HEIGHT,
    toggleCollapsed: () => setIsCollapsed((v) => !v),
  }
}
