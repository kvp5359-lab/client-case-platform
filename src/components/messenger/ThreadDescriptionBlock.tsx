"use client"

/**
 * Блок «Описание» треда — закреплён под шапкой панели, над лентой сообщений.
 *
 * Описание — свойство треда (колонка project_threads.description), НЕ сообщение:
 * нет автора/канала/видимости, никуда не отправляется, в ленте не появляется.
 * Внутренняя заметка команды (клиент панель не видит). Одно поле для всех типов
 * тредов (задача/чат/email). Свёрнут по умолчанию.
 *
 * Право на редактирование = право менять название треда (проверяет RLS при UPDATE).
 */

import { useState } from 'react'
import { AlignLeft, ChevronDown, EyeOff, Plus } from 'lucide-react'
import { useUpdateThread } from '@/hooks/messenger/useProjectThreads'

type Props = {
  threadId: string
  projectId: string | null
  description: string | null
}

export function ThreadDescriptionBlock({ threadId, projectId, description }: Props) {
  const updateThread = useUpdateThread()
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(description ?? '')

  // Сброс при смене треда (adjust-state-on-prop-change, без эффекта).
  const [prevThreadId, setPrevThreadId] = useState(threadId)
  if (prevThreadId !== threadId) {
    setPrevThreadId(threadId)
    setDraft(description ?? '')
    setExpanded(false)
  }
  // Подхватываем внешнее обновление описания, пока блок свёрнут (не затирая ввод).
  const [prevDescription, setPrevDescription] = useState(description ?? '')
  if (prevDescription !== (description ?? '') && !expanded) {
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

  if (!expanded) {
    return (
      <div className="border-b shrink-0">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 px-4 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          {hasDescription ? (
            <>
              <AlignLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 text-foreground/80">{previewLine}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Добавить описание</span>
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="border-b shrink-0 px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" /> Описание
        </button>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <EyeOff className="h-3 w-3 shrink-0" /> только команда
        </span>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder="Внутренняя заметка команды, клиент не видит…"
        rows={3}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-snug outline-none focus:border-ring placeholder:text-muted-foreground/40"
      />
    </div>
  )
}
