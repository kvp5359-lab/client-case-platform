"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface FolderTemplate {
  id: string
  name: string
  description?: string
}

interface Folder {
  id: string
  folder_template_id?: string
}

interface TemplateSelectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: FolderTemplate[]
  folders: Folder[]
  selectedTemplateIds: string[]
  isLoading: boolean
  onToggleTemplate: (templateId: string) => void
  onCreate: () => void
}

export function TemplateSelectDialog({
  open,
  onOpenChange,
  templates,
  folders,
  selectedTemplateIds,
  isLoading,
  onToggleTemplate,
  onCreate,
}: TemplateSelectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Выберите шаблоны папок</DialogTitle>
          <DialogDescription>
            Создайте папки на основе шаблонов из набора документов
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Нет доступных шаблонов папок для этого набора документов</p>
              <p className="text-sm mt-2">Все папки из шаблона уже добавлены</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {templates.map((template) => {
                // Проверяем, добавлена ли папка из этого шаблона
                const isAlreadyAdded = folders.some((f) => f.folder_template_id === template.id)
                const isSelected = selectedTemplateIds.includes(template.id)

                return (
                  <label
                    key={template.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                      isAlreadyAdded
                        ? 'bg-muted/50 opacity-50 cursor-not-allowed'
                        : 'hover:bg-muted/50 cursor-pointer'
                    }`}
                    onClick={() => !isAlreadyAdded && onToggleTemplate(template.id)}
                  >
                    <Checkbox checked={isSelected} disabled={isAlreadyAdded} />
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {template.name}
                        {isAlreadyAdded && (
                          <Badge variant="secondary" className="text-xs">
                            Добавлено
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <div className="text-sm text-muted-foreground">{template.description}</div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onCreate} disabled={selectedTemplateIds.length === 0}>
            Создать ({selectedTemplateIds.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
