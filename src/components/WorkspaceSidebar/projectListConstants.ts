/** Константы и утилиты для ProjectsList */

export const FOLDER_ICON_COLOR = 'hsl(var(--brand-500))'

/** accent_color → { bg, hover } tailwind классы для бейджа непрочитанных */
export const BADGE_COLOR_CLASSES: Record<string, { bg: string; hover: string }> = {
  blue: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600' },
  slate: { bg: 'bg-stone-700', hover: 'hover:bg-stone-800' },
  emerald: { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  amber: { bg: 'bg-amber-500', hover: 'hover:bg-amber-600' },
  rose: { bg: 'bg-rose-500', hover: 'hover:bg-rose-600' },
  violet: { bg: 'bg-violet-500', hover: 'hover:bg-violet-600' },
  orange: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600' },
  cyan: { bg: 'bg-cyan-500', hover: 'hover:bg-cyan-600' },
  pink: { bg: 'bg-pink-500', hover: 'hover:bg-pink-600' },
  indigo: { bg: 'bg-indigo-500', hover: 'hover:bg-indigo-600' },
  red: { bg: 'bg-red-500', hover: 'hover:bg-red-600' },
}

const DEFAULT_BADGE = BADGE_COLOR_CLASSES.blue

export function getBadgeClasses(color: string | undefined, clickable: boolean) {
  const c = BADGE_COLOR_CLASSES[color ?? 'blue'] ?? DEFAULT_BADGE
  return `${c.bg}${clickable ? ` cursor-pointer ${c.hover} transition-colors` : ''}`
}
