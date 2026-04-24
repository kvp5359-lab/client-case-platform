/**
 * Таблица шаблонов слотов с действиями (редактировать, копировать, удалить).
 */

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pencil, Copy, Trash2, Package, HelpCircle, BookOpen } from 'lucide-react'
import type { Database } from '@/types/database'

type SlotTemplate = Database['public']['Tables']['slot_templates']['Row']

interface SlotTemplatesTableProps {
  templates: SlotTemplate[]
  articles: Array<{ id: string; title: string }>
  isLoading: boolean
  searchQuery: string
  onEdit: (template: SlotTemplate) => void
  onCopy: (template: SlotTemplate) => void
  onDelete: (templateId: string) => void
  isCopying: boolean
  isDeleting: boolean
}

export function SlotTemplatesTable({
  templates,
  articles,
  isLoading,
  searchQuery,
  onEdit,
  onCopy,
  onDelete,
  isCopying,
  isDeleting,
}: SlotTemplatesTableProps) {
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
  }

  if (templates.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {searchQuery ? 'Ничего не найдено' : 'Пока нет шаблонов слотов. Создайте первый!'}
      </div>
    )
  }

  const articleMap = new Map(articles.map((a) => [a.id, a.title]))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50%]">Название</TableHead>
          <TableHead className="w-[50%]">Источник описания</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((template) => (
          <TableRow key={template.id} className="group">
            <TableCell>
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="font-medium truncate">{template.name}</span>
                  {template.knowledge_article_id ? (
                    <span title="Привязана статья базы знаний" className="flex-shrink-0">
                      <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                    </span>
                  ) : template.description ? (
                    <span title={template.description} className="flex-shrink-0">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onEdit(template)}
                    title="Редактировать"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onCopy(template)}
                    disabled={isCopying}
                    title="Копировать"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(template.id)}
                    disabled={isDeleting}
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-0">
              {template.knowledge_article_id
                ? articleMap.get(template.knowledge_article_id) ?? 'Статья БЗ'
                : template.description
                  ? template.description.slice(0, 100)
                  : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
