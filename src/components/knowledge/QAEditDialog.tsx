"use client"

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import {
  createQA,
  updateQA,
  indexQA,
  setQATags,
  setQAGroups,
  type KnowledgeQA,
} from '@/services/api/knowledgeSearchService'
import { cn } from '@/lib/utils'

interface QAEditDialogProps {
  workspaceId: string
  qa: KnowledgeQA | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QAEditDialog({ workspaceId, qa, open, onOpenChange }: QAEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {open && (
          <QAEditForm
            key={qa?.id ?? 'new'}
            workspaceId={workspaceId}
            qa={qa}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function QAEditForm({
  workspaceId,
  qa,
  onOpenChange,
}: {
  workspaceId: string
  qa: KnowledgeQA | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = qa !== null

  const [question, setQuestion] = useState(qa?.question ?? '')
  const [answer, setAnswer] = useState(qa?.answer ?? '')
  const [originalQuestion, setOriginalQuestion] = useState(qa?.original_question ?? '')
  const [originalAnswers, setOriginalAnswers] = useState(qa?.original_answers ?? '')
  const [source, setSource] = useState(qa?.source ?? '')
  const [qaDate, setQaDate] = useState(qa?.qa_date ?? '')
  const [isPublished, setIsPublished] = useState(qa?.is_published ?? true)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    qa?.knowledge_qa_tags?.map((t) => t.tag_id) ?? [],
  )
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    qa?.knowledge_qa_groups?.map((g) => g.group_id) ?? [],
  )

  const { data: tags } = useQuery({
    queryKey: knowledgeBaseKeys.tags(workspaceId),
    queryFn: () =>
      supabase
        .from('knowledge_tags')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order')
        .order('name')
        .then((r) => r.data ?? []),
  })

  const { data: groups } = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId),
    queryFn: () =>
      supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order')
        .order('name')
        .then((r) => r.data ?? []),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const params = {
        question: question.trim(),
        answer: answer.trim(),
        original_question: originalQuestion.trim() || null,
        original_answers: originalAnswers.trim() || null,
        source: source.trim() || null,
        qa_date: qaDate || null,
        is_published: isPublished,
      }

      let savedQA: KnowledgeQA

      if (isEdit) {
        savedQA = await updateQA(qa.id, params)
      } else {
        savedQA = await createQA({ ...params, workspace_id: workspaceId })
      }

      await setQATags(savedQA.id, selectedTagIds)
      await setQAGroups(savedQA.id, selectedGroupIds)
      await indexQA(savedQA.id, workspaceId)

      return savedQA
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.qa(workspaceId) })
      toast.success(isEdit ? 'Q&A обновлён' : 'Q&A создан')
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Не удалось сохранить Q&A')
    },
  })

  const canSave = question.trim().length > 0 && answer.trim().length > 0

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Редактировать Q&A' : 'Новый Q&A'}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        {/* Вопрос */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-question">
            Вопрос <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="qa-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Введите вопрос..."
          />
        </div>

        {/* Ответ */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-answer">
            Ответ <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="qa-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Введите ответ..."
          />
        </div>

        {/* Теги */}
        {tags && tags.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Теги</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border cursor-pointer',
                    selectedTagIds.includes(tag.id)
                      ? 'border-transparent text-white'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                  style={
                    selectedTagIds.includes(tag.id)
                      ? { backgroundColor: tag.color || 'hsl(var(--primary))' }
                      : undefined
                  }
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Группы */}
        {groups && groups.length > 0 && (
          <div className="grid gap-1.5">
            <Label>Группы</Label>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border cursor-pointer',
                    selectedGroupIds.includes(group.id)
                      ? 'border-transparent text-white'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                  style={
                    selectedGroupIds.includes(group.id)
                      ? { backgroundColor: group.color || 'hsl(var(--primary))' }
                      : undefined
                  }
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Исходный вопрос */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-original-question">Исходный вопрос</Label>
          <Textarea
            id="qa-original-question"
            value={originalQuestion}
            onChange={(e) => setOriginalQuestion(e.target.value)}
            rows={3}
            placeholder="Оригинальная формулировка вопроса..."
          />
        </div>

        {/* Исходные ответы */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-original-answers">Исходные ответы</Label>
          <Textarea
            id="qa-original-answers"
            value={originalAnswers}
            onChange={(e) => setOriginalAnswers(e.target.value)}
            rows={5}
            placeholder="Оригинальные ответы из чата/консультации..."
          />
        </div>

        {/* Источник */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-source">Источник</Label>
          <Input
            id="qa-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Откуда информация..."
          />
        </div>

        {/* Дата */}
        <div className="grid gap-1.5">
          <Label htmlFor="qa-date">Дата</Label>
          <Input
            id="qa-date"
            type="date"
            value={qaDate}
            onChange={(e) => setQaDate(e.target.value)}
          />
        </div>

        {/* Опубликовано */}
        <div className="flex items-center justify-between">
          <Label htmlFor="qa-published" className="cursor-pointer">
            Опубликовано
          </Label>
          <Switch id="qa-published" checked={isPublished} onCheckedChange={setIsPublished} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Сохранить' : 'Создать'}
        </Button>
      </DialogFooter>
    </>
  )
}
