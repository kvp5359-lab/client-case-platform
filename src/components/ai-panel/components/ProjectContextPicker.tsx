import { useState } from 'react'
import { Check, ChevronDown, FileIcon, FileText, Image as ImageIcon, Lock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ProjectContextScope } from '@/services/api/messenger/messengerAiService'

export interface ProjectContextOption {
  id: string
  name: string
  itemType: 'text' | 'file' | 'screenshot'
  /** Доступен ли текст записи для AI (для text — content_html, для file/screenshot — extracted_text). */
  hasText: boolean
}

interface Props {
  scope: ProjectContextScope
  items: ProjectContextOption[]
  /** Сколько единиц контекста ушло бы в AI при текущем scope (для подписи на чипе). */
  effectiveCount: number
  setScope: (scope: ProjectContextScope) => void
}

export function ProjectContextPicker({ scope, items, effectiveCount, setScope }: Props) {
  const [open, setOpen] = useState(false)
  const isAll = scope.mode === 'all'
  const selectedCount = scope.itemIds.length
  const totalCount = items.length

  const label = isAll
    ? 'Весь контекст'
    : selectedCount === 0
      ? 'Контекст'
      : selectedCount === 1
        ? items.find((i) => i.id === scope.itemIds[0])?.name ?? '1 запись'
        : `${selectedCount} записей`

  const toggleItem = (id: string) => {
    if (isAll) {
      setScope({ mode: 'selected', itemIds: [id] })
      return
    }
    const next = scope.itemIds.includes(id)
      ? scope.itemIds.filter((x) => x !== id)
      : [...scope.itemIds, id]
    setScope({ mode: 'selected', itemIds: next })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
            isAll || selectedCount > 0
              ? 'bg-sky-100 border-sky-300 text-sky-800'
              : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
          }`}
          title="Внутренние материалы команды — заметки, файлы, скриншоты"
        >
          <Lock className="h-3 w-3" />
          {label}
          {(isAll || selectedCount > 0) && effectiveCount > 0 && (
            <span className="opacity-70">{effectiveCount}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start" sideOffset={4}>
        <button
          type="button"
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
          onClick={() => {
            if (isAll) {
              setScope({ mode: 'selected', itemIds: [] })
            } else {
              setScope({ mode: 'all', itemIds: [] })
            }
            setOpen(false)
          }}
        >
          <span className="w-4 inline-flex justify-center">
            {isAll && <Check className="h-3.5 w-3.5" />}
          </span>
          Весь контекст проекта
          <span className="text-[10px] text-muted-foreground ml-auto">{totalCount}</span>
        </button>
        <div className="border-t my-1" />
        <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
          Выбрать записи
        </p>
        <div className="max-h-64 overflow-y-auto">
          {totalCount === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-2">
              В проекте пока нет записей контекста
            </p>
          ) : (
            items.map((item) => {
              const checked = !isAll && scope.itemIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted text-left"
                  onClick={() => toggleItem(item.id)}
                  title={!item.hasText ? 'Текст ещё не извлечён — запись будет проигнорирована ассистентом' : undefined}
                >
                  <span className="w-4 inline-flex justify-center">
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <ItemIcon kind={item.itemType} />
                  <span className={`truncate flex-1 ${item.hasText ? '' : 'text-muted-foreground'}`}>
                    {item.name}
                  </span>
                  {!item.hasText && (
                    <span className="text-[10px] text-amber-700 shrink-0">без текста</span>
                  )}
                </button>
              )
            })
          )}
        </div>
        {!isAll && selectedCount > 0 && (
          <>
            <div className="border-t my-1" />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              onClick={() => setScope({ mode: 'selected', itemIds: [] })}
            >
              Очистить выбор
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ItemIcon({ kind }: { kind: 'text' | 'file' | 'screenshot' }) {
  if (kind === 'text') return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  if (kind === 'screenshot')
    return <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
  return <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
}
