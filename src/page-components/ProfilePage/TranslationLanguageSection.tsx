"use client"

import { Languages } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

export function TranslationLanguageSection() {
  const { data: currentLang, isLoading } = useMyPreferredLanguage()
  const setLang = useSetMyPreferredLanguage()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Перевод сообщений
        </CardTitle>
        <CardDescription>
          На каком языке показывать переводы входящих сообщений и предлагать перевод для отправки
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="translation-lang">Мой язык</Label>
          <Select
            value={currentLang || 'ru'}
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
      </CardContent>
    </Card>
  )
}
