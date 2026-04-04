/**
 * Заголовок шаблона с редактированием
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Pencil, Check, X } from 'lucide-react'
import { FormTemplate } from '../types'
import { Textarea } from '@/components/ui/textarea'

interface TemplateHeaderProps {
  template: FormTemplate
  isEditing: boolean
  editedName: string
  editedDescription: string
  editedAiExtractionPrompt: string
  isUpdating: boolean
  onEditedNameChange: (value: string) => void
  onEditedDescriptionChange: (value: string) => void
  onEditedAiExtractionPromptChange: (value: string) => void
  onStartEditing: () => void
  onSaveEditing: () => void
  onCancelEditing: () => void
}

export function TemplateHeader({
  template,
  isEditing,
  editedName,
  editedDescription,
  editedAiExtractionPrompt,
  isUpdating,
  onEditedNameChange,
  onEditedDescriptionChange,
  onEditedAiExtractionPromptChange,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
}: TemplateHeaderProps) {
  return (
    <Card>
      <CardHeader>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-name" className="text-sm font-medium">
                Название
              </Label>
              <Input
                id="edit-name"
                value={editedName}
                onChange={(e) => onEditedNameChange(e.target.value)}
                placeholder="Название шаблона"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="edit-description" className="text-sm font-medium">
                Описание
              </Label>
              <Input
                id="edit-description"
                value={editedDescription}
                onChange={(e) => onEditedDescriptionChange(e.target.value)}
                placeholder="Описание шаблона"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-ai-prompt" className="text-sm font-medium">
                Промпт для автозаполнения (AI)
              </Label>
              <Textarea
                id="edit-ai-prompt"
                value={editedAiExtractionPrompt}
                onChange={(e) => onEditedAiExtractionPromptChange(e.target.value)}
                placeholder="Опиши, какие данные нужно извлечь из документа. Например: 'Извлеки ФИО, дату рождения, адрес и номер паспорта из документа'"
                className="mt-1.5 min-h-[100px]"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Этот промпт поможет AI понять, какие данные извлекать из документов для автозаполнения анкеты
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={onSaveEditing}
                disabled={isUpdating}
              >
                <Check className="w-4 h-4 mr-2" />
                Сохранить
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onCancelEditing}
                disabled={isUpdating}
              >
                <X className="w-4 h-4 mr-2" />
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <CardTitle className="text-2xl">{template.name}</CardTitle>
              {template.description && (
                <CardDescription>
                  {template.description}
                </CardDescription>
              )}
              {template.ai_extraction_prompt && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-purple-900 mb-1">
                    🤖 Промпт для автозаполнения
                  </p>
                  <p className="text-sm text-purple-700">
                    {template.ai_extraction_prompt}
                  </p>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onStartEditing}>
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}


