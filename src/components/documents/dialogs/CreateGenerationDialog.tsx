"use client"

/**
 * CreateGenerationDialog — создание нового блока генерации документа.
 *
 * Пользователь выбирает шаблон DOCX и задаёт имя → создаётся запись в document_generations.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText } from 'lucide-react'
import { useDocumentTemplates } from '@/hooks/documents/useDocumentTemplates'
import { useCreateDocumentGeneration } from '@/hooks/documents/useDocumentGenerations'

interface CreateGenerationDialogProps {
  projectId: string
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateGenerationDialog({
  projectId,
  workspaceId,
  open,
  onOpenChange,
}: CreateGenerationDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [name, setName] = useState('')
  const { data: templates = [] } = useDocumentTemplates(workspaceId)
  const createMutation = useCreateDocumentGeneration()

  // Автозаполнение имени при выборе шаблона
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (template && !name) {
      setName(template.name)
    }
  }

  // Сброс при закрытии
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedTemplateId('')
      setName('')
    }
    onOpenChange(newOpen)
  }

  const handleCreate = async () => {
    if (!selectedTemplateId || !name.trim()) return

    await createMutation.mutateAsync({
      projectId,
      workspaceId,
      documentTemplateId: selectedTemplateId,
      name: name.trim(),
    })

    handleOpenChange(false)
  }

  const hasTemplates = templates.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить генерацию документа</DialogTitle>
          <DialogDescription>
            {hasTemplates
              ? 'Выберите шаблон DOCX и задайте имя для блока генерации.'
              : 'Для генерации документов необходимо сначала загрузить DOCX-шаблон.'}
          </DialogDescription>
        </DialogHeader>

        {!hasTemplates ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Нет загруженных шаблонов документов.</p>
            <p className="text-sm mt-1">
              Перейдите в <strong>Настройки → Шаблоны → Генерация</strong> и загрузите DOCX-файл.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Шаблон документа</label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите шаблон..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Название</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Доверенность на получение..."
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Отмена
          </Button>
          {hasTemplates && (
            <Button
              onClick={handleCreate}
              disabled={!selectedTemplateId || !name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
