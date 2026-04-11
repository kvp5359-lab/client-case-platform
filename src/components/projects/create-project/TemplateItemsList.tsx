import { Checkbox } from '@/components/ui/checkbox'
import { FileText, FolderOpen, MessagesSquare } from 'lucide-react'
import type { ThreadTemplate } from '@/types/threadTemplate'

interface NamedItem {
  id: string
  name: string
}

interface TemplateItemsListProps {
  docKitTemplates: NamedItem[]
  formTemplates: NamedItem[]
  /** Шаблоны тредов (задач и чатов одним списком), привязанные к типу проекта. */
  threads: ThreadTemplate[]
  selectedDocKitIds: Set<string>
  selectedFormIds: Set<string>
  selectedThreadIds: Set<string>
  onToggleDocKit: (id: string) => void
  onToggleForm: (id: string) => void
  onToggleThread: (id: string) => void
  disabled?: boolean
}

export function TemplateItemsList({
  docKitTemplates,
  formTemplates,
  threads,
  selectedDocKitIds,
  selectedFormIds,
  selectedThreadIds,
  onToggleDocKit,
  onToggleForm,
  onToggleThread,
  disabled,
}: TemplateItemsListProps) {
  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      <p className="text-xs font-medium text-muted-foreground">Будут созданы вместе с проектом:</p>

      {docKitTemplates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Наборы документов
          </p>
          {docKitTemplates.map((tpl) => (
            <label
              key={tpl.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-background/60 rounded px-1.5 py-1 transition-colors"
            >
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
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Анкеты
          </p>
          {formTemplates.map((tpl) => (
            <label
              key={tpl.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-background/60 rounded px-1.5 py-1 transition-colors"
            >
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

      {threads.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <MessagesSquare className="h-3.5 w-3.5" />
            Задачи и чаты
          </p>
          {threads.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-background/60 rounded px-1.5 py-1 transition-colors"
            >
              <Checkbox
                checked={selectedThreadIds.has(t.id)}
                onCheckedChange={() => onToggleThread(t.id)}
                disabled={disabled}
              />
              <span className="text-sm">{t.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
