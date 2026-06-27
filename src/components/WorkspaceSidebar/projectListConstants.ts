/** Константы и утилиты для ProjectsList */

import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

export const FOLDER_ICON_COLOR = 'hsl(var(--brand-500))'

/** accent_color → bg-класс бейджа непрочитанных. Строится из ЕДИНОЙ палитры
 *  (`acc.bgMain` — тот же цвет, что у бейджа треда во «Входящих»), чтобы цвет
 *  бейджа проекта в сайдбаре ВСЕГДА совпадал с цветом треда и покрывал ВСЕ
 *  акценты автоматически. Раньше была отдельная хардкод-карта — отставала от
 *  расширения палитры (graphite/black/... отсутствовали → дефолтный синий). */
export const BADGE_COLOR_CLASSES: Record<string, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.bgMain(s)]),
)

export function getBadgeClasses(color: string | undefined, clickable: boolean) {
  const bg = BADGE_COLOR_CLASSES[color ?? 'blue'] ?? BADGE_COLOR_CLASSES.blue
  // hover — generic brightness (а не -600 на цвет), т.к. цвет идёт через CSS-var.
  return `${bg}${clickable ? ' cursor-pointer hover:brightness-95 transition-[filter]' : ''}`
}
