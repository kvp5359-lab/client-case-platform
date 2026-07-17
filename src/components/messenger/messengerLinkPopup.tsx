"use client"

/**
 * Всплывашка работы со ссылками в композере мессенджера.
 *
 * Два режима одного попапа:
 * - `view` — каретка стоит внутри ссылки (без выделения): показываем URL +
 *   кнопки «перейти / изменить / снять ссылку». Открывается сам по
 *   selectionUpdate.
 * - `edit` — редактирование/создание: инпут URL + применить. Открывается
 *   кнопкой тулбара (см. `requestLinkEditor`) или из view-режима («изменить»).
 *   Если в выделении уже есть ссылки — дополнительно кнопка «Снять ссылки»
 *   (удаляет все ссылки внутри выделения, текст остаётся).
 *
 * Паттерн портала/закрытия — тот же, что у всплывашки «Номер пункта» в
 * MinimalTiptapEditor: портал в body (fixed от трансформированного предка
 * уносит за экран), закрытие по mousedown снаружи.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { ExternalLink, Pencil, Unlink, Check, ClipboardPaste } from 'lucide-react'
import { normalizeHref, countLinkSegments } from '@/lib/messenger/linkUrl'

// Связь «кнопка тулбара → попап» без проброса пропсов: тулбар и попап живут в
// разных компонентах, но оба знают editor. Реестр «editor → открывашка» держим
// на globalThis через Symbol.for: при HMR dev-сервер может загрузить ДВЕ копии
// этого модуля, и обычный модульный WeakMap у кнопки и у попапа оказался бы
// разным — кнопка «ничего не делала». Symbol.for один на все копии модуля.
const REGISTRY_KEY = Symbol.for('cc.messenger.linkEditorOpeners')
const registryHost = globalThis as { [REGISTRY_KEY]?: WeakMap<Editor, () => void> }
const openers: WeakMap<Editor, () => void> = (registryHost[REGISTRY_KEY] ??= new WeakMap())

/** Открыть редактор ссылки для данного editor (зовёт кнопка тулбара). */
export function requestLinkEditor(editor: Editor) {
  openers.get(editor)?.()
}

type PopupState = {
  left: number
  top: number
  mode: 'view' | 'edit'
  href: string
  /** Сколько отдельных СЕГМЕНТОВ ссылок в выделении. 0 — ссылок нет, 1 — можно
   *  править, >1 — прячем поле URL, оставляем только «Снять все ссылки». */
  linksInSelection: number
}

const POPUP_WIDTH = 300

function clampLeft(left: number): number {
  if (typeof window === 'undefined') return left
  return Math.max(8, Math.min(left, window.innerWidth - POPUP_WIDTH - 8))
}

export function MessengerLinkPopup({ editor }: { editor: Editor | null }) {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [draft, setDraft] = useState('')
  const popupRef = useRef<HTMLDivElement | null>(null)

  const positionAtSelection = useCallback((ed: Editor) => {
    const coords = ed.view.coordsAtPos(ed.state.selection.from)
    return { left: clampLeft(coords.left), top: Math.max(8, coords.top - 44) }
  }, [])

  // Кнопка тулбара → edit-режим (создать / изменить / снять по выделению).
  const openEditor = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) return
    const { from, to, empty } = editor.state.selection
    const linkType = editor.state.schema.marks.link
    const linksInSelection =
      !empty && linkType ? countLinkSegments(editor.state.doc, from, to, linkType) : 0
    const href = (editor.getAttributes('link').href as string | undefined) ?? ''
    // При выделении с существующими ссылками инпут оставляем пустым: там может
    // быть несколько разных ссылок, показ одной из них сбивает. Основное
    // действие в этом случае — «снять ссылки», а не правка одной.
    setDraft(linksInSelection > 0 ? '' : href)
    setPopup({ ...positionAtSelection(editor), mode: 'edit', href, linksInSelection })
  }, [editor, positionAtSelection])

  useEffect(() => {
    if (!editor) return
    openers.set(editor, openEditor)
    return () => {
      if (openers.get(editor) === openEditor) openers.delete(editor)
    }
  }, [editor, openEditor])

  // Каретка внутри ссылки (без выделения) → view-режим. Открытый edit-режим
  // не сбиваем (пользователь печатает URL, выделение может дёргаться).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const handler = () => {
      setPopup((prev) => {
        if (prev?.mode === 'edit') return prev
        const { empty } = editor.state.selection
        if (empty && editor.isEditable && editor.isActive('link')) {
          const href = (editor.getAttributes('link').href as string | undefined) ?? ''
          return { ...positionAtSelection(editor), mode: 'view', href, linksInSelection: 0 }
        }
        return prev ? null : prev
      })
    }
    editor.on('selectionUpdate', handler)
    return () => {
      editor.off('selectionUpdate', handler)
    }
  }, [editor, positionAtSelection])

  // Закрытие по клику снаружи. Слушатель вешаем на СЛЕДУЮЩЕМ кадре: кнопка
  // тулбара открывает попап на своём `mousedown`, и если повесить слушатель
  // синхронно — тот же самый `mousedown`, всплыв до document, сразу же закроет
  // попап (React успевает синхронно закоммитить эффект). rAF даёт открывающему
  // событию завершиться. (Попап «Номер пункта» той же проблемы избегает тем,
  // что открывается по `click`, а слушает `mousedown` — разные события.)
  useEffect(() => {
    if (!popup) return
    const onDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopup(null)
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', onDown)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', onDown)
    }
  }, [popup])

  const applyDraft = useCallback(() => {
    if (!editor) return
    const href = normalizeHref(draft)
    const { empty } = editor.state.selection
    if (!href) {
      // Пустой URL = снять ссылку (если стоим на ней)
      if (editor.isActive('link')) {
        editor.chain().focus().extendMarkRange('link').unsetLink().run()
      } else {
        editor.chain().focus().run()
      }
    } else if (empty && editor.isActive('link')) {
      // Каретка внутри ссылки — правим всю ссылку целиком
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else if (empty) {
      // Ничего не выделено и не на ссылке — вставляем URL как текст-ссылку
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    } else {
      // Выделение — вешаем/заменяем ссылку на нём
      editor.chain().focus().setLink({ href }).run()
    }
    setPopup(null)
  }, [editor, draft])

  const removeLinksInSelection = useCallback(() => {
    if (!editor) return
    editor.chain().focus().unsetLink().run()
    setPopup(null)
  }, [editor])

  const removeLinkAtCaret = useCallback(() => {
    if (!editor) return
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setPopup(null)
  }, [editor])

  const switchToEdit = useCallback(() => {
    if (!popup) return
    setDraft(popup.href)
    setPopup({ ...popup, mode: 'edit' })
  }, [popup])

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) setDraft(text)
    } catch {
      // нет доступа к буферу (не secure context / отказ) — тихо игнорируем
    }
  }, [])

  if (!popup || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-[1000] flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md"
      style={{ left: popup.left, top: popup.top }}
    >
      {popup.mode === 'view' ? (
        <>
          <span
            className="truncate text-muted-foreground max-w-[160px]"
            title={popup.href}
          >
            {popup.href}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Перейти по ссылке"
            // preventDefault на mousedown — не отбираем фокус у редактора
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => window.open(popup.href, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Изменить ссылку"
            onMouseDown={(e) => e.preventDefault()}
            onClick={switchToEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-accent"
            title="Снять ссылку (текст останется)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={removeLinkAtCaret}
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        </>
      ) : popup.linksInSelection > 1 ? (
        // Несколько разных ссылок в выделении — поле URL прячем (какую из них
        // показывать/править неясно), оставляем одно действие «снять все».
        <button
          type="button"
          className="shrink-0 inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-muted-foreground hover:text-destructive hover:bg-accent whitespace-nowrap"
          title="Снять все ссылки в выделенном тексте (текст останется)"
          onClick={removeLinksInSelection}
        >
          <Unlink className="h-3.5 w-3.5" />
          Снять все ссылки
        </button>
      ) : (
        <>
          <div className="relative">
            <input
              autoFocus
              type="text"
              value={draft}
              placeholder="https://…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyDraft()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setPopup(null)
                  editor?.chain().focus().run()
                }
              }}
              className={`w-44 rounded border border-input bg-background py-0.5 pl-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${draft ? 'pr-1.5' : 'pr-16'}`}
            />
            {!draft && (
              <button
                type="button"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent"
                title="Вставить из буфера обмена"
                // preventDefault на mousedown — не теряем фокус инпута
                onMouseDown={(e) => e.preventDefault()}
                onClick={pasteFromClipboard}
              >
                <ClipboardPaste className="h-3 w-3" />
                Вставить
              </button>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Применить"
            onClick={applyDraft}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          {popup.linksInSelection === 1 && (
            <>
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-accent"
                title="Снять ссылку (текст останется)"
                onClick={removeLinksInSelection}
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </>
      )}
    </div>,
    document.body,
  )
}
