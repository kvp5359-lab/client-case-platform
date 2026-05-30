"use client"

/**
 * Тела блоков плана для объединённого списка (ProjectFlatPlanList).
 *
 * Простые, без rich-text:
 * - heading — заголовок секции (одна строка);
 * - text — многострочный простой текст (сворачивание — на уровне строки списка);
 * - slot — ссылка на слот документа (статус «собран/нужен» + срок).
 *
 * Задачи в плане рисуются НЕ здесь, а тем же TaskRow, что и в списке задач.
 */

import { useEffect, useRef, useState } from 'react'
import { FolderOpen, AlertTriangle } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { formatShortDate, formatDateToString, parseDateString } from '@/utils/format/dateFormat'

/**
 * HTML → простой текст. Нужно для legacy-блоков, созданных прежним rich-text
 * редактором (Tiptap). Для нового простого текста (без тегов) — возвращает
 * исходную строку. Блочные теги превращаются в переносы строк.
 */
function htmlToPlain(s: string): string {
  if (!s) return ''
  if (!/<[a-z!/]/i.test(s)) return s // нет тегов — это уже plain
  return s
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type PlanBlockDisplay = {
  id: string
  block_type: 'text' | 'heading' | 'task' | 'slot'
  visible_to_client: boolean
  content: string | null
  slot: {
    name: string
    deadline: string | null
    filled: boolean
  } | null
  /** Ссылка ведёт на удалённую/недоступную сущность. */
  missing: boolean
}

// ── Заголовок секции (одна строка, click-to-edit) ─────────

export function HeadingBlockBody({
  content,
  editing,
  onChange,
}: {
  content: string | null
  editing: boolean
  onChange: (value: string) => void
}) {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState(content ?? '')
  const plain = htmlToPlain(content ?? '')

  const activate = () => {
    setValue(plain)
    setActive(true)
  }

  if (!editing || !active) {
    const empty = !plain.trim()
    return (
      <div
        className={editing ? '-mx-1 cursor-text rounded px-1 hover:bg-muted/50' : ''}
        onClick={editing ? activate : undefined}
        role={editing ? 'button' : undefined}
        tabIndex={editing ? 0 : undefined}
        onKeyDown={
          editing
            ? (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  activate()
                }
              }
            : undefined
        }
      >
        {empty ? (
          <p className="text-lg font-semibold italic text-muted-foreground">
            {editing ? 'Заголовок секции' : ''}
          </p>
        ) : (
          <h3 className="text-lg font-semibold">{plain}</h3>
        )}
      </div>
    )
  }

  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setActive(false)
        if (value !== (content ?? '')) onChange(value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder="Заголовок секции"
      className="h-9 text-lg font-semibold"
    />
  )
}

// ── Многострочный текст (click-to-edit, textarea) ─────────

export function TextBlockBody({
  content,
  editing,
  onChange,
}: {
  content: string | null
  editing: boolean
  onChange: (value: string) => void
}) {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState(content ?? '')
  const ref = useRef<HTMLTextAreaElement>(null)
  const plain = htmlToPlain(content ?? '')

  const activate = () => {
    setValue(plain)
    setActive(true)
  }

  useEffect(() => {
    if (active) ref.current?.focus()
  }, [active])

  if (!editing || !active) {
    const empty = !plain.trim()
    return (
      <div
        className={editing ? '-mx-1 cursor-text rounded px-1 py-0.5 hover:bg-muted/50' : ''}
        onClick={editing ? activate : undefined}
        role={editing ? 'button' : undefined}
        tabIndex={editing ? 0 : undefined}
        onKeyDown={
          editing
            ? (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  activate()
                }
              }
            : undefined
        }
      >
        {empty ? (
          <p className="text-sm italic text-muted-foreground">
            {editing ? 'Нажмите, чтобы добавить текст' : 'Пустой текст'}
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{plain}</p>
        )}
      </div>
    )
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setActive(false)
        if (value !== (content ?? '')) onChange(value)
      }}
      rows={4}
      placeholder="Текст плана…"
      className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  )
}

// ── Блок-слот (документ) ──────────────────────────────────

export function SlotBlockBody({
  display,
  editing,
  onChangeSlotDeadline,
}: {
  display: PlanBlockDisplay
  editing: boolean
  onChangeSlotDeadline: (deadline: string | null) => void
}) {
  if (display.missing || !display.slot) {
    return <MissingRef icon={<FolderOpen className="size-4" />} label="Документ удалён или недоступен" />
  }
  const { name, deadline, filled } = display.slot

  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox checked={filled} disabled aria-label={filled ? 'Собран' : 'Нужен'} />
      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{name}</span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
          filled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {filled ? 'собран' : 'нужен'}
      </span>

      {editing ? (
        <Input
          type="date"
          value={deadline ? formatDateToString(parseDateString(deadline) ?? null) : ''}
          onChange={(e) => {
            const v = e.target.value
            onChangeSlotDeadline(v ? new Date(v).toISOString() : null)
          }}
          className="ml-auto h-7 w-36 text-xs"
        />
      ) : (
        deadline && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatShortDate(deadline)}
          </span>
        )
      )}
    </div>
  )
}

function MissingRef({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
      <AlertTriangle className="size-4 text-amber-500" />
      <span className="opacity-60">{icon}</span>
      <span className="italic">{label}</span>
    </div>
  )
}
