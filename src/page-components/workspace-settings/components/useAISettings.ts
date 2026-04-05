import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'

export interface ModelOption {
  value: string
  label: string
  provider: 'anthropic' | 'google'
}

export const AI_MODELS: ModelOption[] = [
  {
    value: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5 — быстрая, $1/$5 за 1M токенов',
    provider: 'anthropic',
  },
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 — умная, $3/$15 за 1M токенов',
    provider: 'anthropic',
  },
  {
    value: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5 — предыдущая версия, $3/$15 за 1M токенов',
    provider: 'anthropic',
  },
  {
    value: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro — самая умная, preview',
    provider: 'google',
  },
  {
    value: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash — быстрая, уровень Pro, preview',
    provider: 'google',
  },
  {
    value: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash-Lite — самая дешёвая, preview',
    provider: 'google',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash — быстрая, стабильная',
    provider: 'google',
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite — самая быстрая и дешёвая',
    provider: 'google',
  },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — мощная, стабильная', provider: 'google' },
]

export interface ThinkingOption {
  value: string
  label: string
  description: string
}

export const THINKING_OPTIONS: ThinkingOption[] = [
  { value: 'auto', label: 'Авто', description: 'Модель сама решает, сколько думать' },
  { value: '0', label: 'Отключено', description: 'Максимальная скорость, без размышлений' },
  { value: '1024', label: 'Минимум', description: 'Быстрый ответ с лёгким анализом' },
  { value: '8192', label: 'Средний', description: 'Глубокий анализ документов и рассуждения' },
]

export function getProvider(model: string): 'anthropic' | 'google' {
  return AI_MODELS.find((m) => m.value === model)?.provider ?? 'anthropic'
}

export function useAISettings(workspaceId: string) {
  const [aiModelOverride, setAiModelOverride] = useState<string | null>(null)
  const [thinkingOverride, setThinkingOverride] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const queryClient = useQueryClient()

  const queryKey = ['workspace-ai-settings', workspaceId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('ai_model, anthropic_api_key_id, google_api_key_id, gemini_thinking_budget')
        .eq('id', workspaceId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

  const hasAnthropicKey = !!data?.anthropic_api_key_id
  const hasGoogleKey = !!data?.google_api_key_id
  const aiModel = aiModelOverride ?? data?.ai_model ?? 'claude-haiku-4-5-20251001'
  const provider = getProvider(aiModel)
  const hasApiKey = provider === 'anthropic' ? hasAnthropicKey : hasGoogleKey

  const dbThinkingBudget = data?.gemini_thinking_budget
  const thinkingBudget =
    thinkingOverride ??
    (dbThinkingBudget === null || dbThinkingBudget === undefined
      ? 'auto'
      : String(dbThinkingBudget))

  const setAiModel = (value: string) => {
    setAiModelOverride(value)
    setApiKey('')
    setTestResult(null)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const thinkingValue = thinkingBudget === 'auto' ? null : Number(thinkingBudget)
      const { error: modelError } = await supabase
        .from('workspaces')
        .update({ ai_model: aiModel as never, gemini_thinking_budget: thinkingValue })
        .eq('id', workspaceId)
      if (modelError) throw modelError

      if (apiKey.trim()) {
        const rpcName =
          provider === 'anthropic' ? 'set_workspace_api_key' : 'set_workspace_google_api_key'
        const { error: keyError } = await supabase.rpc(rpcName, {
          workspace_uuid: workspaceId,
          api_key: apiKey.trim(),
        })
        if (keyError) throw keyError
      }
    },
    onSuccess: () => {
      setApiKey('')
      setAiModelOverride(null)
      setThinkingOverride(null)
      queryClient.invalidateQueries({ queryKey })
      toast.success('Настройки AI сохранены!')
    },
    onError: () => {
      toast.error('Ошибка при сохранении настроек')
    },
  })

  const deleteKeyMutation = useMutation({
    mutationFn: async () => {
      const rpcName =
        provider === 'anthropic' ? 'delete_workspace_api_key' : 'delete_workspace_google_api_key'
      const { error } = await supabase.rpc(rpcName, { workspace_uuid: workspaceId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('API ключ удалён')
    },
    onError: () => {
      toast.error('Ошибка при удалении ключа')
    },
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke('test-ai-connection', {
        body: { workspace_id: workspaceId, model: aiModel },
      })
      return response.data
    },
    onSuccess: (data) => {
      if (data?.success) {
        setTestResult({
          success: true,
          message: `✅ Подключение успешно! Модель ${data.model} отвечает корректно.`,
        })
      } else {
        const errorDetails = data?.details
          ? `\n\nДетали: ${JSON.stringify(data.details, null, 2)}`
          : ''
        setTestResult({
          success: false,
          message: `❌ ${data?.error || 'Неизвестная ошибка'}${errorDetails}`,
        })
      }
    },
    onError: (err) => {
      setTestResult({
        success: false,
        message: `❌ Ошибка подключения: ${err instanceof Error ? err.message : 'Проверьте API ключ и модель'}`,
      })
    },
  })

  const handleDeleteKey = async () => {
    const ok = await confirm({
      title: 'Удалить API ключ?',
      description: 'Проверка документов перестанет работать.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteKeyMutation.mutate()
  }

  const isBusy = saveMutation.isPending || deleteKeyMutation.isPending || testMutation.isPending

  return {
    isLoading,
    aiModel,
    provider,
    hasApiKey,
    hasAnthropicKey,
    hasGoogleKey,
    apiKey,
    setApiKey,
    setAiModel,
    thinkingBudget,
    setThinkingOverride,
    testResult,
    setTestResult,
    isBusy,
    saveMutation,
    deleteKeyMutation,
    testMutation,
    handleDeleteKey,
    confirmState,
    handleConfirm,
    handleCancel,
    anthropicModels: AI_MODELS.filter((m) => m.provider === 'anthropic'),
    googleModels: AI_MODELS.filter((m) => m.provider === 'google'),
  }
}
