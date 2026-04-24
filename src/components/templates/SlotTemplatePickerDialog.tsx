/**
 * SlotTemplatePickerDialog — выбор шаблона слота из справочника.
 *
 * При выборе вызывает onPick с name/description/knowledge_article_id.
 * Вызывающий код копирует эти поля в инлайн-слот (folder_template_slots
 * или document_kit_template_folder_slots) — не live-reference.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search, Package, BookOpen, HelpCircle, Loader2 } from 'lucide-react'
import type { Database } from '@/types/database'

type SlotTemplate = Database['public']['Tables']['slot_templates']['Row']

export interface PickedSlotTemplate {
  name: string
  description: string | null
  knowledge_article_id: string | null
}

interface SlotTemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  onPick: (picked: PickedSlotTemplate) => void
}

export function SlotTemplatePickerDialog({
  open,
  onOpenChange,
  workspaceId,
  onPick,
}: SlotTemplatePickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['slot-templates', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slot_templates')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return (data as SlotTemplate[]) ?? []
    },
    enabled: !!workspaceId && open,
  })

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    )
  }, [templates, searchQuery])

  const handlePick = (t: SlotTemplate) => {
    onPick({
      name: t.name,
      description: t.description,
      knowledge_article_id: t.knowledge_article_id,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить слот из справочника</DialogTitle>
          <DialogDescription>
            Поля шаблона скопируются в новый слот. Потом их можно будет изменить
            независимо — изменения в справочнике на этот слот не повлияют.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Поиск по названию, описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {searchQuery
                ? 'Ничего не найдено'
                : 'Справочник пуст. Создайте шаблон слота в разделе Шаблоны → Шаблоны слотов.'}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(t)}
                    className="w-full text-left py-2.5 px-2 rounded-md hover:bg-muted/60 flex items-start gap-3"
                  >
                    <Package className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        {t.knowledge_article_id ? (
                          <BookOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        ) : t.description ? (
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                        ) : null}
                      </div>
                      {t.description && !t.knowledge_article_id && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
