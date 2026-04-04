/**
 * AISettingsSection — настройки AI проверки документов.
 *
 * Поддерживает два провайдера: Anthropic Claude и Google Gemini.
 * Показывает поле API-ключа в зависимости от выбранного провайдера.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAISettings, THINKING_OPTIONS } from './useAISettings'

interface AISettingsSectionProps {
  workspaceId: string
}

export function AISettingsSection({ workspaceId }: AISettingsSectionProps) {
  const {
    isLoading,
    aiModel,
    provider,
    hasApiKey,
    apiKey,
    setApiKey,
    setAiModel,
    thinkingBudget,
    setThinkingOverride,
    testResult,
    setTestResult,
    isBusy,
    saveMutation,
    testMutation,
    handleDeleteKey,
    confirmState,
    handleConfirm,
    handleCancel,
    anthropicModels,
    googleModels,
  } = useAISettings(workspaceId)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>🤖 Настройки AI проверки документов</CardTitle>
          <CardDescription>
            Настройте интеграцию с AI для автоматической проверки документов
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">Загрузка настроек...</div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="ai-model">Модель AI</Label>
                <select
                  id="ai-model"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <optgroup label="Anthropic Claude">
                    {anthropicModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Google Gemini">
                    {googleModels.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-xs text-gray-500">
                  {provider === 'anthropic'
                    ? 'Haiku 4.5 подходит для большинства задач и работает быстрее всего. Sonnet 4.6 — самая новая и мощная.'
                    : 'Gemini 3.x — новейшие модели (preview). Gemini 2.5 — стабильные, проверенные модели.'}
                </p>
              </div>

              {provider === 'google' && (
                <div className="space-y-2">
                  <Label htmlFor="thinking-budget">Режим размышлений</Label>
                  <select
                    id="thinking-budget"
                    value={thinkingBudget}
                    onChange={(e) => setThinkingOverride(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {THINKING_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    Чем больше модель «думает», тем точнее ответ, но дольше и дороже. «Отключено» —
                    для простых задач (OCR, перевод). «Средний» — для анализа документов.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  {provider === 'anthropic' ? 'API ключ Anthropic' : 'API ключ Google AI'}
                  {hasApiKey && (
                    <Badge variant="secondary" className="ml-2">
                      ✓ Настроен
                    </Badge>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      hasApiKey
                        ? '••••••••••••••••'
                        : provider === 'anthropic'
                          ? 'sk-ant-api03-...'
                          : 'AIza...'
                    }
                    className="flex-1"
                  />
                  {hasApiKey && (
                    <Button
                      variant="outline"
                      onClick={handleDeleteKey}
                      disabled={isBusy}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Удалить
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {provider === 'anthropic' ? (
                    <>
                      Получите ключ на{' '}
                      <a
                        href="https://console.anthropic.com/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        console.anthropic.com
                      </a>
                    </>
                  ) : (
                    <>
                      Получите ключ на{' '}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        aistudio.google.com
                      </a>
                    </>
                  )}
                  . Ключ хранится в зашифрованном виде.
                </p>
              </div>

              {testResult && (
                <div
                  className={`p-4 rounded-md text-sm ${
                    testResult.success
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {testResult.message}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={() => saveMutation.mutate()} disabled={isBusy}>
                  {saveMutation.isPending ? 'Сохранение...' : 'Сохранить настройки AI'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setTestResult(null)
                    testMutation.mutate()
                  }}
                  disabled={!hasApiKey || isBusy}
                >
                  {testMutation.isPending ? '🔄 Проверка...' : '🔌 Проверить подключение'}
                </Button>
              </div>

              {!hasApiKey && (
                <p className="text-xs text-amber-600">
                  ⚠️ Для проверки подключения сначала сохраните API ключ
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
