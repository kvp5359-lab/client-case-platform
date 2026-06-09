"use client"

import { Languages } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useMyPreferredLanguage,
  useSetMyPreferredLanguage,
  TRANSLATION_LANGUAGES,
} from '@/hooks/useMyPreferredLanguage'
import { IntegrationRow } from './IntegrationRow'

export function TranslationLanguageSection() {
  const { data: currentLang, isLoading } = useMyPreferredLanguage()
  const setLang = useSetMyPreferredLanguage()
  const lang = currentLang || 'ru'
  const langLabel = TRANSLATION_LANGUAGES.find((l) => l.code === lang)?.label ?? lang

  return (
    <IntegrationRow
      icon={<Languages className="h-5 w-5 text-muted-foreground" />}
      title="Перевод сообщений"
      statusLabel={langLabel}
      tone="off"
    >
      <div className="space-y-2 max-w-xs">
        <p className="text-xs text-muted-foreground">
          На каком языке показывать переводы входящих сообщений и предлагать перевод для отправки.
        </p>
        <Label htmlFor="translation-lang">Мой язык</Label>
        <Select
          value={lang}
          disabled={isLoading || setLang.isPending}
          onValueChange={(v) => setLang.mutate(v)}
        >
          <SelectTrigger id="translation-lang">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSLATION_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </IntegrationRow>
  )
}
