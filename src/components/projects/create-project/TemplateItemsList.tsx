import { createElement } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { FileText, FolderOpen, MessagesSquare, Heading, Type as TypeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { htmlToPlain } from '@/components/plan/PlanBlockItem'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { TemplatePlanBlockRow } from '@/types/plan'

type NamedItem = {
  id: string
  name: string
}

type TemplateItemsListProps = {
  docKitTemplates: NamedItem[]
  formTemplates: NamedItem[]
  /** Шаблоны тредов (задач и чатов одним списком), привязанные к типу проекта. */
  threads: ThreadTemplate[]
  /**
   * Структурные блоки плана шаблона (заголовки/текст). Показываются в одном
   * списке с задачами по общему порядку sort_order.
   */
  planBlocks: TemplatePlanBlockRow[]
  selectedDocKitIds: Set<string>
  selectedFormIds: Set<string>
  selectedThreadIds: Set<string>
  selectedBlockIds: Set<string>
  onToggleDocKit: (id: string) => void
  onToggleForm: (id: string) => void
  onToggleThread: (id: string) => void
  onToggleBlock: (id: string) => void
  disabled?: boolean
}

type MergedRow =
  | { kind: 'task'; id: string; sort: number; template: ThreadTemplate }
  | { kind: 'block'; id: string; sort: number; block: TemplatePlanBlockRow }

const ROW_CLASS =
  'flex items-center gap-1.5 cursor-pointer hover:bg-background/60 rounded px-1.5 py-0.5 transition-colors'

export function TemplateItemsList({
  docKitTemplates,
  formTemplates,
  threads,
  planBlocks,
  selectedDocKitIds,
  selectedFormIds,
  selectedThreadIds,
  selectedBlockIds,
  onToggleDocKit,
  onToggleForm,
  onToggleThread,
  onToggleBlock,
  disabled,
}: TemplateItemsListProps) {
  // Задачи и структурные блоки — в одном списке по общей шкале sort_order
  // (как на вкладке «Задачи» в проекте).
  const merged: MergedRow[] = [
    ...threads.map(
      (t) => ({ kind: 'task' as const, id: t.id, sort: t.sort_order ?? 0, template: t }),
    ),
    ...planBlocks.map((b) => ({ kind: 'block' as const, id: b.id, sort: b.sort_order, block: b })),
  ].sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      <p className="text-xs font-medium text-muted-foreground">Будут созданы вместе с проектом:</p>

      {docKitTemplates.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-lg font-semibold text-muted-foreground/60 flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Наборы документов
          </p>
          {docKitTemplates.map((tpl) => (
            <label key={tpl.id} className={ROW_CLASS}>
              <Checkbox
                checked={selectedDocKitIds.has(tpl.id)}
                onCheckedChange={() => onToggleDocKit(tpl.id)}
                disabled={disabled}
              />
              <span className="text-sm">{tpl.name}</span>
            </label>
          ))}
        </div>
      )}

      {formTemplates.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-lg font-semibold text-muted-foreground/60 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Анкеты
          </p>
          {formTemplates.map((tpl) => (
            <label key={tpl.id} className={ROW_CLASS}>
              <Checkbox
                checked={selectedFormIds.has(tpl.id)}
                onCheckedChange={() => onToggleForm(tpl.id)}
                disabled={disabled}
              />
              <span className="text-sm">{tpl.name}</span>
            </label>
          ))}
        </div>
      )}

      {merged.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-lg font-semibold text-muted-foreground/60 flex items-center gap-1.5">
            <MessagesSquare className="h-3.5 w-3.5" />
            Задачи и чаты
          </p>
          {merged.map((row) => {
            if (row.kind === 'task') {
              const t = row.template
              return (
                <label key={row.id} className={ROW_CLASS}>
                  <Checkbox
                    checked={selectedThreadIds.has(row.id)}
                    onCheckedChange={() => onToggleThread(row.id)}
                    disabled={disabled}
                  />
                  <span className="text-sm truncate min-w-0">{t.name}</span>
                  {createElement(getChatIconComponent(t.icon ?? ''), {
                    className: cn(
                      'h-3.5 w-3.5 shrink-0',
                      COLOR_TEXT[(t.accent_color ?? "") as ThreadAccentColor] ?? 'text-muted-foreground',
                    ),
                  })}
                </label>
              )
            }
            const plain = htmlToPlain(row.block.content ?? '')
            const isHeading = row.block.block_type === 'heading'
            return (
              <label key={row.id} className={ROW_CLASS}>
                <Checkbox
                  checked={selectedBlockIds.has(row.id)}
                  onCheckedChange={() => onToggleBlock(row.id)}
                  disabled={disabled}
                />
                {isHeading ? (
                  <Heading className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={
                    isHeading
                      ? 'text-sm font-semibold truncate'
                      : 'text-sm text-muted-foreground truncate'
                  }
                >
                  {plain || (isHeading ? 'Заголовок' : 'Текстовый блок')}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
