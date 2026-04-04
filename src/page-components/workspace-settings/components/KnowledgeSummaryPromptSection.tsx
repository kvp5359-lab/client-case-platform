/**
 * KnowledgeSummaryPromptSection — настройка промпта для AI-генерации summary статей базы знаний.
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

const DEFAULT_SUMMARY_PROMPT = `Перечисли кратко все темы и сущности, которые содержатся в этой статье. Не пересказывай, а укажи что внутри: какие документы, процессы, суммы, сроки, типы ВНЖ и т.д. Формат — одно предложение-заголовок и список тем через запятую. Максимум 100 слов. Отвечай на русском языке.`

interface KnowledgeSummaryPromptSectionProps {
  workspaceId: string
}

export function KnowledgeSummaryPromptSection({ workspaceId }: KnowledgeSummaryPromptSectionProps) {
  const queryClient = useQueryClient()

  const queryKey = ['workspace-summary-prompt', workspaceId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('knowledge_summary_prompt')
        .eq('id', workspaceId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

  const [promptText, setPromptText] = useState('')
  const serverValue = data?.knowledge_summary_prompt || ''
  // Синхронизируем локальное состояние при изменении серверных данных
  useEffect(() => {
    setPromptText(serverValue)
  }, [serverValue])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('workspaces')
        .update({ knowledge_summary_prompt: promptText.trim() || null })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Промпт для summary сохранён')
    },
    onError: () => {
      toast.error('Не удалось сохранить промпт')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Промпт для AI Summary</CardTitle>
        <CardDescription>
          Промпт, который используется для автоматической генерации краткого описания (summary)
          статей базы знаний. Summary помогает AI точнее подбирать источники при поиске.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4 text-gray-500">Загрузка...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="summary-prompt">Промпт</Label>
              <Textarea
                id="summary-prompt"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder={DEFAULT_SUMMARY_PROMPT}
                rows={6}
                className="resize-y"
              />
              <p className="text-xs text-gray-500">
                Если поле пустое, используется промпт по умолчанию. Промпт получает заголовок и
                текст статьи, и должен вернуть краткое перечисление тем.
              </p>
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
