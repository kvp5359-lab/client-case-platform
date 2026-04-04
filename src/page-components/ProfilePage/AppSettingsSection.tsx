"use client"

/**
 * AppSettingsSection — секция настроек приложения
 * Настройки AI модели, темы оформления и уведомлений
 * TODO (Z5-12): Заменить нативные <select> на shadcn Select для единообразия UI
 */

import { memo } from 'react'
import { Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Database } from '@/types/database'

type UserSettings = Database['public']['Tables']['user_settings']['Row']

export interface AppSettingsSectionProps {
  settings: UserSettings | null
  loading: boolean
  saving: boolean
  onSettingsChange: (settings: UserSettings) => void
  onSave: () => void
  onCancel: () => void
}

export const AppSettingsSection = memo(function AppSettingsSection({
  settings,
  loading,
  saving,
  onSettingsChange,
  onSave,
  onCancel,
}: AppSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки приложения</CardTitle>
        <CardDescription>Персональные предпочтения и параметры</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-gray-600">Загрузка...</p>
        ) : (
          <>
            {/* Предпочитаемая модель AI */}
            <div className="space-y-2">
              <Label htmlFor="ai-model">Предпочитаемая модель AI</Label>
              <select
                id="ai-model"
                value={settings?.preferred_ai_model || 'claude-3-5-haiku-20241022'}
                onChange={(e) =>
                  settings && onSettingsChange({ ...settings, preferred_ai_model: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="gpt-4o">GPT-4o</option>
              </select>
            </div>

            {/* Тема оформления */}
            <div className="space-y-2">
              <Label htmlFor="theme">Тема оформления</Label>
              <select
                id="theme"
                value={settings?.theme || 'light'}
                onChange={(e) =>
                  settings && onSettingsChange({ ...settings, theme: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="light">Светлая</option>
                <option value="dark">Тёмная</option>
                <option value="auto">Авто</option>
              </select>
            </div>

            {/* Уведомления */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notifications"
                checked={settings?.notifications_enabled ?? true}
                onChange={(e) =>
                  settings &&
                  onSettingsChange({ ...settings, notifications_enabled: e.target.checked })
                }
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <Label htmlFor="notifications" className="cursor-pointer">
                Включить уведомления
              </Label>
            </div>

            {/* Кнопка сохранения */}
            <div className="flex gap-3 pt-4">
              <Button onClick={onSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Сохраняется...' : 'Сохранить'}
              </Button>
              <Button variant="outline" onClick={onCancel}>
                Отмена
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
})
