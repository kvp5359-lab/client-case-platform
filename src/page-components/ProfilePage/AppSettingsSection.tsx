"use client"

/**
 * AppSettingsSection — строка «Настройки приложения» в аккордеоне профиля.
 * Настройки AI-модели, темы оформления и уведомлений.
 */

import { memo } from 'react'
import { Save, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Database } from '@/types/database'
import { IntegrationRow } from './IntegrationRow'

type UserSettings = Database['public']['Tables']['user_settings']['Row']

export type AppSettingsSectionProps = {
  settings: UserSettings | null
  loading: boolean
  saving: boolean
  onSettingsChange: (settings: UserSettings) => void
  onSave: () => void
  onCancel: () => void
}

const THEME_LABELS: Record<string, string> = { light: 'Светлая', dark: 'Тёмная', auto: 'Авто' }

export const AppSettingsSection = memo(function AppSettingsSection({
  settings,
  loading,
  saving,
  onSettingsChange,
  onSave,
  onCancel,
}: AppSettingsSectionProps) {
  const themeLabel = THEME_LABELS[settings?.theme || 'light'] ?? 'Светлая'

  return (
    <IntegrationRow
      icon={<Settings className="h-5 w-5 text-muted-foreground" />}
      title="Настройки приложения"
      statusLabel={loading ? '…' : themeLabel}
      tone="off"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <div className="space-y-5">
          {/* Предпочитаемая модель AI */}
          <div className="space-y-2">
            <Label htmlFor="ai-model">Предпочитаемая модель AI</Label>
            <Select
              value={settings?.preferred_ai_model || 'claude-3-5-haiku-20241022'}
              onValueChange={(value) =>
                settings && onSettingsChange({ ...settings, preferred_ai_model: value })
              }
            >
              <SelectTrigger id="ai-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</SelectItem>
                <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Тема оформления */}
          <div className="space-y-2">
            <Label htmlFor="theme">Тема оформления</Label>
            <Select
              value={settings?.theme || 'light'}
              onValueChange={(value) => settings && onSettingsChange({ ...settings, theme: value })}
            >
              <SelectTrigger id="theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Светлая</SelectItem>
                <SelectItem value="dark">Тёмная</SelectItem>
                <SelectItem value="auto">Авто</SelectItem>
              </SelectContent>
            </Select>
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

          {/* Кнопки */}
          <div className="flex gap-3 pt-1">
            <Button onClick={onSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Сохраняется...' : 'Сохранить'}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </IntegrationRow>
  )
})
