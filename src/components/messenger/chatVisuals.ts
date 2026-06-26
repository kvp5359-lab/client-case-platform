/**
 * Лёгкие визуальные хелперы чата: иконка по имени, accent-классы вкладки.
 * Вынесены из EditChatDialog.tsx (тяжёлый компонент-диалог), чтобы потребители
 * иконок не тянули весь диалог в бандл. ChatSettingsDialog реэкспортирует их
 * для обратной совместимости.
 */

import { Hash } from 'lucide-react'
import { THREAD_ICONS } from './threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

/** Получить React-компонент иконки по строковому имени */
export function getChatIconComponent(iconName: string) {
  return THREAD_ICONS.find((i) => i.value === iconName)?.icon ?? Hash
}

/** Получить accent bg class для вкладки чата */
export function getChatTabAccent(accentColor: ThreadAccentColor): {
  active: string
  badge: string
} {
  const map: Record<ThreadAccentColor, { active: string; badge: string }> = {
    blue: { active: 'bg-blue-50 text-blue-600', badge: 'bg-blue-600' },
    slate: { active: 'bg-white text-stone-900', badge: 'bg-stone-600' },
    emerald: { active: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-600' },
    amber: { active: 'bg-amber-50 text-amber-700', badge: 'bg-amber-500' },
    rose: { active: 'bg-red-50 text-red-600', badge: 'bg-red-500' },
    violet: { active: 'bg-violet-50 text-violet-600', badge: 'bg-violet-600' },
    orange: { active: 'bg-orange-50 text-orange-600', badge: 'bg-orange-500' },
    cyan: { active: 'bg-cyan-50 text-cyan-700', badge: 'bg-cyan-600' },
    pink: { active: 'bg-pink-50 text-pink-600', badge: 'bg-pink-500' },
    indigo: { active: 'bg-indigo-50 text-indigo-600', badge: 'bg-indigo-600' },
    green: { active: 'bg-green-50 text-green-700', badge: 'bg-green-500' },
    sky: { active: 'bg-sky-50 text-sky-700', badge: 'bg-sky-500' },
    brown: { active: 'bg-amber-50 text-amber-800', badge: 'bg-amber-800' },
    taupe: { active: 'bg-stone-50 text-stone-700', badge: 'bg-stone-500' },
    red: { active: 'bg-red-50 text-red-700', badge: 'bg-red-700' },
    black: { active: 'bg-neutral-100 text-neutral-800', badge: 'bg-neutral-900' },
    graphite: { active: 'bg-neutral-100 text-neutral-700', badge: 'bg-neutral-600' },
  }
  return map[accentColor] ?? map.blue
}
