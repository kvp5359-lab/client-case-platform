"use client"

/**
 * Вкладка «Q&A» внутри пикера быстрых ответов (QuickReplyPicker).
 * Показывает вопросы-ответы базы знаний, доступные в контексте треда,
 * и по одиночному клику ВСТАВЛЯЕТ ТЕКСТ ОТВЕТА в редактор (как быстрый ответ).
 * Поиск управляется извне (единое поле пикера) — ищет по вопросу И ответу,
 * в списке показываются только вопросы.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, HelpCircle, FolderOpen } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { knowledgeBaseKeys, STALE_TIME } from '@/hooks/queryKeys'
import { getShareableQA, type ShareableQA } from '@/services/api/knowledge/knowledgeQAService'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** answer хранится как обычный текст → сохраняем переносы строк. */
const answerToHtml = (answer: string) => escapeHtml(answer).replace(/\n/g, '<br>')

type Props = {
  editor: Editor
  workspaceId: string
  /** null для личного треда без проекта (тогда сервер вернёт только «везде»). */
  projectId: string | null
  /** Поисковый запрос из общего поля пикера. */
  search: string
  /** Грузить данные (попап открыт). */
  enabled: boolean
  /** Закрыть попап после вставки. */
  onInserted: () => void
}

export function QaPickerTab({ editor, workspaceId, projectId, search, enabled, onInserted }: Props) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: knowledgeBaseKeys.pickerQa(workspaceId, projectId),
    enabled: enabled && !!workspaceId,
    queryFn: () => getShareableQA(workspaceId, projectId),
    staleTime: STALE_TIME.LONG,
  })

  const q = search.trim().toLowerCase()

  const filtered = useMemo(
    () =>
      q
        ? data.filter(
            (i) => i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q),
          )
        : data,
    [data, q],
  )

  // Группировка: без группы → сверху, затем по группам.
  const grouped = useMemo(() => {
    const noGroup: ShareableQA[] = []
    const map = new Map<string, ShareableQA[]>()
    for (const item of filtered) {
      if (!item.group_name) {
        noGroup.push(item)
        continue
      }
      const arr = map.get(item.group_name)
      if (arr) arr.push(item)
      else map.set(item.group_name, [item])
    }
    return { noGroup, groups: [...map.entries()] }
  }, [filtered])

  const insert = (answer: string) => {
    editor.chain().focus().insertContent(answerToHtml(answer)).run()
    onInserted()
  }

  const empty = filtered.length === 0

  return (
    <div className="h-[400px] overflow-y-auto overflow-x-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-destructive">Не удалось загрузить.</div>
      ) : empty ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {q ? 'Ничего не найдено' : 'Нет доступных вопросов-ответов'}
        </div>
      ) : (
        <div className="py-1">
          {grouped.noGroup.map((item) => (
            <QaRow key={item.qa_id} item={item} indent={false} onSelect={insert} />
          ))}
          {grouped.groups.map(([name, items]) => (
            <div key={name}>
              <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <FolderOpen className="h-3 w-3" />
                {name}
              </div>
              {items.map((item) => (
                <QaRow key={item.qa_id} item={item} indent onSelect={insert} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QaRow({
  item,
  indent,
  onSelect,
}: {
  item: ShareableQA
  indent: boolean
  onSelect: (answer: string) => void
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center min-w-0 pr-3 py-1 transition-colors cursor-pointer overflow-hidden hover:bg-accent',
        indent ? 'pl-7' : 'pl-3',
      )}
      onClick={() => onSelect(item.answer)}
      title="Вставить ответ"
    >
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-2" />
      <span className="text-sm truncate">{item.question}</span>
    </div>
  )
}
