"use client"

/**
 * AccentPaletteSection — настройка палитры акцентных цветов воркспейса.
 * Для каждого видимого цвета можно задать основной и светлый тон + видеть
 * живые тестовые бабблы (исходящий = основной/тёмный, входящий = светлый,
 * чип реакции). Сохраняется в workspaces.accent_overrides; пусто → стандартный
 * цвет. Применяется через AccentThemeStyle (CSS-переменные) — превью и реальные
 * чаты используют ОДНИ И ТЕ ЖЕ классы, поэтому обновляются вживую.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Palette, RotateCcw } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SettingsCard } from './SettingsCard'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys } from '@/hooks/queryKeys'
import { ACCENT_COLORS } from '@/components/messenger/threadConstants'
import { bubbleStyles } from '@/components/messenger/utils/messageStyles'
import {
  resolveAccentHex,
  resolveAccentLabel,
  type AccentOverrides,
  type AccentSlug,
} from '@/lib/accentPalette'

type Props = { workspaceId: string }

const VISIBLE = ACCENT_COLORS.filter((c) => !c.hidden)

/** Тестовые бабблы одного цвета: исходящий (тёмный) + входящий (светлый) + реакция. */
function PreviewBubbles({ slug }: { slug: AccentSlug }) {
  const st = bubbleStyles[slug]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('rounded-2xl rounded-br-sm px-2.5 py-1 text-xs', st.own)}>Исходящее</span>
      <span className={cn('rounded-2xl rounded-bl-sm px-2.5 py-1 text-xs', st.incoming)}>Входящее</span>
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', st.reaction)}>
        👍 2
      </span>
    </div>
  )
}

export function AccentPaletteSection({ workspaceId }: Props) {
  const { data: workspace } = useWorkspace(workspaceId)
  const queryClient = useQueryClient()
  const overrides = (workspace?.accent_overrides as AccentOverrides | null) ?? {}

  const saveMutation = useMutation({
    mutationFn: async (next: AccentOverrides) => {
      const { error } = await supabase
        .from('workspaces')
        .update({ accent_overrides: next })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  const setTone = (slug: AccentSlug, tone: 'main' | 'light', value: string) => {
    const next: AccentOverrides = { ...overrides, [slug]: { ...overrides[slug], [tone]: value } }
    saveMutation.mutate(next)
  }

  const setName = (slug: AccentSlug, value: string) => {
    const trimmed = value.trim()
    const entry = { ...overrides[slug] }
    if (trimmed) entry.name = trimmed
    else delete entry.name
    const next: AccentOverrides = { ...overrides, [slug]: entry }
    saveMutation.mutate(next)
  }

  const resetSlug = (slug: AccentSlug) => {
    const next: AccentOverrides = { ...overrides }
    delete next[slug]
    saveMutation.mutate(next)
  }

  return (
    <SettingsCard
      title="Палитра цветов чатов"
      description="Цвета акцента для чатов и задач. Под каждым цветом — живые примеры бабблов (тёмный = исходящее, светлый = входящее). Меняешь тон — примеры обновляются сразу. «Сбросить» возвращает стандартный цвет."
      icon={Palette}
      padded={false}
    >
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {VISIBLE.map((c) => {
            const slug = c.value as AccentSlug
            const cur = resolveAccentHex(slug, overrides)
            const label = resolveAccentLabel(slug, overrides, c.label)
            const ov = overrides[slug]
            const isOverridden = !!ov?.main || !!ov?.light || !!ov?.name
            return (
              <div key={slug} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 sm:w-80 shrink-0">
                  <input
                    key={`${slug}:${label}`}
                    type="text"
                    defaultValue={label}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== label) setName(slug, e.target.value)
                    }}
                    title="Название цвета (можно переименовать)"
                    className="flex-1 min-w-0 text-sm bg-transparent rounded px-2 py-1 border border-transparent hover:border-border focus:border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  />
                  <input
                    type="color"
                    value={cur.main}
                    onChange={(e) => setTone(slug, 'main', e.target.value)}
                    title="Основной (тёмный) тон"
                    className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border bg-transparent p-0"
                  />
                  <input
                    type="color"
                    value={cur.light}
                    onChange={(e) => setTone(slug, 'light', e.target.value)}
                    title="Светлый тон"
                    className="w-7 h-7 shrink-0 rounded cursor-pointer border border-border bg-transparent p-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={!isOverridden}
                    title={isOverridden ? 'Сбросить к стандартному' : 'Стандартный цвет'}
                    onClick={() => resetSlug(slug)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex-1 min-w-0">
                  <PreviewBubbles slug={slug} />
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Название можно переименовать. Левый квадрат — основной (тёмный) тон, правый — светлый.
          Цвет текста на тёмном баббле подбирается автоматически по яркости.
        </p>
      </CardContent>
    </SettingsCard>
  )
}
