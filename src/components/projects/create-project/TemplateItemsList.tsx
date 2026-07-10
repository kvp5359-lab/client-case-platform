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
import type { TemplateTaskGroupRow } from '@/types/taskGroups'

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
  /** Группы задач шаблона — для группировки задач/чатов как в редакторе шаблона. */
  taskGroups?: TemplateTaskGroupRow[]
  selectedDocKitIds: Set<string>
  selectedFormIds: Set<string>
  selectedThreadIds: Set<string>
  selectedBlockIds: Set<string>
  onToggleDocKit: (id: string) => void
  onToggleForm: (id: string) => void
  onToggleThread: (id: string) => void
  onToggleBlock: (id: string) => void
  /** Массово отметить/снять все задачи и чаты (+блоки). */
  onToggleAllTasks?: (select: boolean) => void
  disabled?: boolean
  /** Заголовок списка. Пустая строка — не рендерить (заголовок вынесен наружу). */
  title?: string
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
  taskGroups = [],
  selectedDocKitIds,
  selectedFormIds,
  selectedThreadIds,
  selectedBlockIds,
  onToggleDocKit,
  onToggleForm,
  onToggleThread,
  onToggleBlock,
  onToggleAllTasks,
  disabled,
  title = 'Будут созданы вместе с проектом:',
}: TemplateItemsListProps) {
  // Задачи и структурные блоки — в одном списке по общей шкале sort_order
  // (как на вкладке «Задачи» в проекте).
  const merged: MergedRow[] = [
    ...threads.map(
      (t) => ({ kind: 'task' as const, id: t.id, sort: t.sort_order ?? 0, template: t }),
    ),
    ...planBlocks.map((b) => ({ kind: 'block' as const, id: b.id, sort: b.sort_order, block: b })),
  ].sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))

  // Членство строки в группе задач шаблона (task_group_id у задачи, group_id у блока).
  const groupOf = (row: MergedRow): string | null =>
    row.kind === 'task' ? (row.template.task_group_id ?? null) : (row.block.group_id ?? null)
  const ungroupedRows = merged.filter((r) => groupOf(r) === null)
  const sortedGroups = [...taskGroups].sort((a, b) => a.sort_order - b.sort_order)
  const rowsOfGroup = (gid: string) => merged.filter((r) => groupOf(r) === gid)

  const isRowSelected = (row: MergedRow) =>
    row.kind === 'task' ? selectedThreadIds.has(row.id) : selectedBlockIds.has(row.id)
  const allTasksSelected = merged.length > 0 && merged.every(isRowSelected)

  const renderRow = (row: MergedRow) => {
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
              COLOR_TEXT[(t.accent_color ?? '') as ThreadAccentColor] ?? 'text-muted-foreground',
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
            isHeading ? 'text-sm font-semibold truncate' : 'text-sm text-muted-foreground truncate'
          }
        >
          {plain || (isHeading ? 'Заголовок' : 'Текстовый блок')}
        </span>
      </label>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}

      {docKitTemplates.length === 0 && formTemplates.length === 0 && merged.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground/70">
          Выберите тип проекта, чтобы задать его состав.
        </p>
      )}

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
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-muted-foreground/60 flex items-center gap-1.5">
              <MessagesSquare className="h-3.5 w-3.5" />
              Задачи и чаты
            </p>
            {onToggleAllTasks && (
              <button
                type="button"
                onClick={() => onToggleAllTasks(!allTasksSelected)}
                disabled={disabled}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {allTasksSelected ? 'Снять все' : 'Выбрать все'}
              </button>
            )}
          </div>

          {/* Вне групп — плоским списком по порядку. */}
          {ungroupedRows.map(renderRow)}

          {/* Группы задач — как в редакторе шаблона (read-only: только чекбоксы). */}
          {sortedGroups.map((g) => {
            const rows = rowsOfGroup(g.id)
            if (rows.length === 0) return null
            return (
              <div key={g.id} className="rounded-md border bg-background/40 mt-1.5">
                <div className="flex items-center gap-1.5 border-b bg-muted/40 px-2 py-1">
                  <span className="text-sm font-semibold truncate min-w-0 flex-1">{g.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
                </div>
                <div className="py-0.5 px-1">{rows.map(renderRow)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
