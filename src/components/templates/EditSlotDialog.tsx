/**
 * EditSlotDialog — унифицированный диалог редактирования слота.
 *
 * Используется в трёх местах:
 * 1. SlotsEditor — инлайн-слоты внутри шаблона папки и набора документов
 * 2. SlotTemplatesContent — справочник шаблонов слотов воркспейса
 * 3. (через SlotsEditor) — слоты в проекте при необходимости
 *
 * Структура повторяет EditKitFolderDialog: две вкладки «Основное» / «AI-промпты»,
 * чтобы слоты и папки настраивались одинаково.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArticleTreePicker,
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from './ArticleTreePicker'
import { NameWithCommentField } from './NameWithCommentField'

export type SlotDialogValue = {
  name: string
  description: string | null
  knowledge_article_id: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
  /** Только для справочника шаблонов слотов (см. withComment). */
  comment?: string | null
}

type EditSlotDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Заголовок диалога. Если не задан — «Слот» / «Создать слот». */
  title?: string
  /** Текущее значение слота (для редактирования). null/undefined — создание. */
  value?: SlotDialogValue | null
  /** Стабильный ключ для сброса внутреннего состояния (обычно id слота). */
  instanceKey?: string
  /**
   * Показать поле «Комментарий» рядом с названием. Только для справочника
   * шаблонов слотов: у слотов-экземпляров внутри папок такой колонки нет,
   * и поле было бы обещанием, которое некуда сохранить.
   */
  withComment?: boolean
  isPending?: boolean
  articles?: Array<{ id: string; title: string }>
  groups?: ArticleTreePickerGroup[]
  articleGroups?: ArticleTreePickerLink[]
  onSubmit: (data: SlotDialogValue) => void
}

const EMPTY: SlotDialogValue = {
  name: '',
  description: null,
  knowledge_article_id: null,
  ai_naming_prompt: null,
  ai_check_prompt: null,
  comment: null,
}

export function EditSlotDialog(props: EditSlotDialogProps) {
  // Внутренние стейты держим в дочернем компоненте с key — это гарантирует
  // сброс формы при открытии диалога или смене редактируемого слота,
  // без useEffect-каскадов.
  const { open, onOpenChange, instanceKey } = props
  if (!open) {
    return <Dialog open={open} onOpenChange={onOpenChange} />
  }
  return <EditSlotDialogInner key={instanceKey ?? 'new'} {...props} />
}

function EditSlotDialogInner({
  open,
  onOpenChange,
  title,
  value,
  withComment,
  isPending,
  articles = [],
  groups = [],
  articleGroups = [],
  onSubmit,
}: EditSlotDialogProps) {
  const initial = value ?? EMPTY
  const [name, setName] = useState(initial.name)
  const [comment, setComment] = useState(initial.comment ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [knowledgeArticleId, setKnowledgeArticleId] = useState<string | null>(
    initial.knowledge_article_id,
  )
  const [aiNamingPrompt, setAiNamingPrompt] = useState(initial.ai_naming_prompt ?? '')
  const [aiCheckPrompt, setAiCheckPrompt] = useState(initial.ai_check_prompt ?? '')
  const [descriptionMode, setDescriptionMode] = useState<'text' | 'article'>(
    initial.knowledge_article_id ? 'article' : 'text',
  )

  const isEditing = !!value
  const headerTitle = title ?? (isEditing ? 'Слот' : 'Создать слот')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({
      name: trimmed,
      description: descriptionMode === 'text' ? description.trim() || null : null,
      knowledge_article_id: descriptionMode === 'article' ? knowledgeArticleId : null,
      ai_naming_prompt: aiNamingPrompt.trim() || null,
      ai_check_prompt: aiCheckPrompt.trim() || null,
      // Без withComment ключа в payload быть не должно: вызывающий для слотов
      // внутри папок пишет в таблицу, где такой колонки нет.
      ...(withComment ? { comment: comment.trim() || null } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{headerTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="slot-name">Название</Label>
            {withComment ? (
              <NameWithCommentField
                nameId="slot-name"
                name={name}
                comment={comment}
                onNameChange={setName}
                onCommentChange={setComment}
                namePlaceholder="Название слота"
                autoFocus
              />
            ) : (
              <Input
                id="slot-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Загранпаспорт, Диплом"
                autoFocus
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Описание для клиента</Label>
            {articles.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="slot-description-mode"
                    checked={descriptionMode === 'text'}
                    onChange={() => {
                      setDescriptionMode('text')
                      setKnowledgeArticleId(null)
                    }}
                  />
                  Текст
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="slot-description-mode"
                    checked={descriptionMode === 'article'}
                    onChange={() => setDescriptionMode('article')}
                  />
                  Статья базы знаний
                </label>
              </div>
            )}

            {descriptionMode === 'text' ? (
              <Textarea
                id="slot-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Опишите, какой документ ожидается в этом слоте"
                rows={4}
              />
            ) : (
              <ArticleTreePicker
                articles={articles}
                groups={groups}
                articleGroups={articleGroups}
                selectedId={knowledgeArticleId}
                onSelect={setKnowledgeArticleId}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="slot-ai-naming">AI-промпт для именования</Label>
              <Textarea
                id="slot-ai-naming"
                value={aiNamingPrompt}
                onChange={(e) => setAiNamingPrompt(e.target.value)}
                placeholder="Если задан — переопределяет промпт папки для документов, прикреплённых к этому слоту"
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slot-ai-check">AI-промпт для проверки</Label>
              <Textarea
                id="slot-ai-check"
                value={aiCheckPrompt}
                onChange={(e) => setAiCheckPrompt(e.target.value)}
                placeholder="Если задан — переопределяет промпт папки для документов, прикреплённых к этому слоту"
                rows={6}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? 'Сохранение...' : isEditing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
