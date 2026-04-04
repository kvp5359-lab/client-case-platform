"use client"

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

interface BlockGapInserterProps {
  editor: Editor | null
}

const COMPLEX_SELECTORS = [
  '.columns-container',
  '[data-type="callout"]',
  '.node-callout',
  'details[data-type="accordion"]',
  '.node-accordion',
  'table',
  'hr',
  'blockquote',
  'img',
]

function isComplexBlock(el: HTMLElement): boolean {
  if (COMPLEX_SELECTORS.some((sel) => el.matches(sel))) return true
  // Check if the block contains a complex element (e.g. img inside a wrapper)
  return COMPLEX_SELECTORS.some((sel) => el.querySelector(sel) !== null)
}

// Module-level state to survive React remounts
let globalListener: ((e: MouseEvent) => void) | null = null
const globalEditorRef: { current: Editor | null } = { current: null }
let globalContainerEl: HTMLDivElement | null = null
let globalLineEl: HTMLDivElement | null = null
let globalGapIndex: number | null = null
let globalHoveringButton = false

function showGap(top: number, index: number) {
  if (!globalContainerEl) return

  globalGapIndex = index

  if (!globalLineEl) {
    const wrapper = document.createElement('div')
    wrapper.style.cssText =
      'position:absolute;left:0;right:0;height:0;display:flex;align-items:center;justify-content:center;z-index:5;transform:translateY(-50%);'

    const line = document.createElement('div')
    line.style.cssText =
      'position:absolute;left:16px;right:16px;height:2px;background:hsl(var(--primary)/0.3);border-radius:1px;'
    wrapper.appendChild(line)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = '+'
    btn.style.cssText =
      'position:relative;z-index:1;width:20px;height:20px;border-radius:50%;border:1.5px solid hsl(var(--primary)/0.4);background:white;color:hsl(var(--primary));font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;padding:0;'

    btn.addEventListener('mouseenter', () => {
      globalHoveringButton = true
    })
    btn.addEventListener('mouseleave', () => {
      globalHoveringButton = false
    })
    btn.addEventListener('click', () => {
      const ed = globalEditorRef.current
      const idx = globalGapIndex
      if (!ed || idx == null) return

      const doc = ed.state.doc
      let blockIndex = 0
      let targetPos = 0
      doc.forEach((node, offset) => {
        if (blockIndex === idx) {
          targetPos = offset + node.nodeSize
        }
        blockIndex++
      })

      ed.chain()
        .focus()
        .insertContentAt(targetPos, { type: 'paragraph' })
        .setTextSelection(targetPos + 1)
        .run()

      hideGap()
    })

    wrapper.appendChild(btn)
    globalContainerEl.appendChild(wrapper)
    globalLineEl = wrapper
  }

  globalLineEl.style.top = `${top}px`
  globalLineEl.style.display = 'flex'
}

function hideGap() {
  globalGapIndex = null
  if (globalLineEl) {
    globalLineEl.style.display = 'none'
  }
}

function onMouseMove(e: MouseEvent) {
  if (globalHoveringButton) return

  const ed = globalEditorRef.current
  const container = globalContainerEl
  if (!ed || !container) return

  const editorDOM = ed.view.dom
  const containerRect = container.getBoundingClientRect()
  const editorRect = editorDOM.getBoundingClientRect()
  const mouseY = e.clientY
  const mouseX = e.clientX

  if (
    mouseX < editorRect.left ||
    mouseX > editorRect.right ||
    mouseY < editorRect.top ||
    mouseY > editorRect.bottom
  ) {
    hideGap()
    return
  }

  const children: HTMLElement[] = []
  for (let i = 0; i < editorDOM.children.length; i++) {
    const el = editorDOM.children[i]
    if (el instanceof HTMLElement) children.push(el)
  }

  const EDGE_ZONE = 12

  for (let i = 0; i < children.length - 1; i++) {
    const current = children[i]
    const next = children[i + 1]

    if (!isComplexBlock(current) && !isComplexBlock(next)) continue

    const currentRect = current.getBoundingClientRect()
    const nextRect = next.getBoundingClientRect()
    const borderY = (currentRect.bottom + nextRect.top) / 2

    if (mouseY >= borderY - EDGE_ZONE && mouseY <= borderY + EDGE_ZONE) {
      const top = borderY - containerRect.top
      showGap(top, i)
      return
    }
  }

  hideGap()
}

function ensureListener() {
  if (!globalListener) {
    globalListener = onMouseMove
    document.addEventListener('mousemove', globalListener)
  }
}

function removeListener() {
  if (globalListener) {
    document.removeEventListener('mousemove', globalListener)
    globalListener = null
  }
}

export function BlockGapInserter({ editor }: BlockGapInserterProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    globalEditorRef.current = editor
  })

  useEffect(() => {
    globalContainerEl = containerRef.current
    ensureListener()

    return () => {
      // Only clean up if this is a real unmount (not StrictMode double-invoke)
      // We check if the container is still in the DOM
      setTimeout(() => {
        if (containerRef.current == null && !document.querySelector('[data-gap-inserter]')) {
          removeListener()
          if (globalLineEl) {
            globalLineEl.remove()
            globalLineEl = null
          }
          globalContainerEl = null
        }
      }, 100)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      data-gap-inserter=""
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    />
  )
}
