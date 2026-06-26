/**
 * Лёгкие визуальные хелперы чата: иконка по имени, accent-классы вкладки.
 * Вынесены из EditChatDialog.tsx (тяжёлый компонент-диалог), чтобы потребители
 * иконок не тянули весь диалог в бандл. ChatSettingsDialog реэкспортирует их
 * для обратной совместимости.
 */

import { Hash } from 'lucide-react'
import { THREAD_ICONS } from './threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

/** Получить React-компонент иконки по строковому имени */
export function getChatIconComponent(iconName: string) {
  return THREAD_ICONS.find((i) => i.value === iconName)?.icon ?? Hash
}

/** Получить accent bg class для вкладки чата */
export function getChatTabAccent(accentColor: ThreadAccentColor): {
  active: string
  badge: string
} {
  const map = Object.fromEntries(
    ACCENT_SLUGS.map((s) => [
      s,
      { active: `${acc.bgSoft(s)} ${acc.textMain(s)}`, badge: acc.bgMain(s) },
    ]),
  ) as Record<ThreadAccentColor, { active: string; badge: string }>
  return map[accentColor] ?? map.blue
}
