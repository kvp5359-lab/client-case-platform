"use client"

/**
 * Таблетка «Описание» треда — компактный pill в ряду над лентой; по клику
 * открывает поповер с textarea.
 *
 * Описание — свойство треда (колонка project_threads.description), НЕ сообщение:
 * нет автора/канала/видимости, никуда не отправляется, в ленте не появляется.
 * Внутренняя заметка команды (клиент панель не видит). Право на редактирование =
 * право менять название треда (проверяет RLS при UPDATE).
 */

import { useState } from 'react'
import { AlignLeft, EyeOff } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUpdateThread } from '@/hooks/messenger/useProjectThreads'

type Props = {
  threadId: string
  projectId: string | null
  description: string | null
  /** 'pill' — таблетка с превью; 'compact' — только иконка; 'banner' — бабл во всю ширину. */
  variant?: 'pill' | 'compact' | 'banner'
}

export function ThreadDescriptionBlock({
  threadId,
  projectId,
  description,
  variant = 'pill',
}: Props) {
  const updateThread = useUpdateThread()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(description ?? '')

  // Сброс при смене треда (adjust-state-on-prop-change, без эффекта).
  const [prevThreadId, setPrevThreadId] = useState(threadId)
  if (prevThreadId !== threadId) {
    setPrevThreadId(threadId)
    setDraft(description ?? '')
    setOpen(false)
  }
  // Подхватываем внешнее обновление, пока поповер закрыт (не затирая ввод).
  const [prevDescription, setPrevDescription] = useState(description ?? '')
  if (prevDescription !== (description ?? '') && !open) {
    setPrevDescription(description ?? '')
    setDraft(description ?? '')
  }

  const hasDescription = Boolean((description ?? '').trim())
  const previewLine = (description ?? '').split('\n').find((l) => l.trim()) ?? ''

  const save = () => {
    const next = draft.trim() ? draft : null
    if (next === (description ?? null)) return
    updateThread.mutate({ threadId, projectId: projectId ?? '', description: next })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) save()
      }}
    >
      <PopoverTrigger asChild>
        {variant === 'banner' ? (
          <button
            type="button"
            className="flex w-full items-start gap-2.5 rounded-2xl bg-neutral-100 px-4 py-3 text-left text-sm leading-relaxed text-neutral-800 transition-colors hover:bg-neutral-200"
            title="Описание — внутренняя заметка команды (видят только сотрудники)"
          >
            <AlignLeft className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {hasDescription ? description : (
                <span className="text-neutral-500">Добавить описание…</span>
              )}
            </span>
          </button>
        ) : variant === 'compact' ? (
          <button
            type="button"
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white/80 backdrop-blur-sm transition-colors hover:bg-muted/50 ${
              hasDescription ? 'text-foreground' : 'text-muted-foreground'
            }`}
            title={hasDescription ? `Описание: ${previewLine}` : 'Описание — внутренняя заметка команды'}
          >
            <AlignLeft className="w-4 h-4 shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 max-w-[240px] rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            title="Описание — внутренняя заметка команды"
          >
            <AlignLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{hasDescription ? previewLine : 'Описание'}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2 space-y-1.5">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          placeholder="Внутренняя заметка команды, клиент не видит…"
          rows={4}
          className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm leading-snug outline-none focus:border-ring placeholder:text-muted-foreground/40"
        />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <EyeOff className="h-3 w-3 shrink-0" /> Видят только сотрудники
        </p>
      </PopoverContent>
    </Popover>
  )
}
