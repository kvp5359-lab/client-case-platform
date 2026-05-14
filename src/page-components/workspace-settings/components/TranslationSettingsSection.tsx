"use client"

/**
 * Секция «Перевод сообщений» в общих настройках воркспейса.
 * - Выбор LLM-модели для translate-message (отдельно от общей ai_model).
 * - Чекбокс: подмешивать N последних сообщений треда как контекст.
 */

import { Languages } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AI_MODELS } from './useAISettings'
import {
  useTranslationSettings,
  useUpdateTranslationSettings,
} from '@/hooks/useTranslationSettings'

const SAME_AS_WORKSPACE = '__same__'

export function TranslationSettingsSection({ workspaceId }: { workspaceId: string }) {
  const { data: settings, isLoading } = useTranslationSettings(workspaceId)
  const update = useUpdateTranslationSettings(workspaceId)

  const currentModel = settings?.translation_model ?? null
  const useContext = settings?.translation_use_thread_context ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Перевод сообщений
        </CardTitle>
        <CardDescription>
          Модель и опции для перевода входящих и исходящих сообщений
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 max-w-[600px]">
          <Label htmlFor="translation-model">Модель</Label>
          <Select
            value={currentModel ?? SAME_AS_WORKSPACE}
            disabled={isLoading || update.isPending}
            onValueChange={(v) =>
              update.mutate({
                translation_model: v === SAME_AS_WORKSPACE ? null : v,
              })
            }
          >
            <SelectTrigger id="translation-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SAME_AS_WORKSPACE}>
                Как для воркспейса (общая модель)
              </SelectItem>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Для перевода обычно достаточно быстрой и дешёвой модели (Haiku или Flash-Lite).
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 pt-1">
          <div className="space-y-0.5">
            <Label htmlFor="translation-context" className="cursor-pointer">
              Использовать контекст диалога
            </Label>
            <p className="text-xs text-muted-foreground max-w-md">
              Подмешивать несколько последних сообщений треда в запрос — улучшает согласованность
              терминов и тона перевода. Расходует чуть больше токенов.
            </p>
          </div>
          <Switch
            id="translation-context"
            checked={useContext}
            disabled={isLoading || update.isPending}
            onCheckedChange={(v) => update.mutate({ translation_use_thread_context: v })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
