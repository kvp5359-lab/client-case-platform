/**
 * accentPalette — единый источник правды для акцентных цветов тредов и их
 * НАСТРАИВАЕМОЙ версии (workspaces.accent_overrides).
 *
 * Идея: вместо жёстких Tailwind-классов (`bg-blue-500`) карты стилей теперь
 * используют arbitrary-классы с CSS-переменной и ФОЛБЭКОМ на текущий цвет:
 *   `bg-[var(--acc-blue-main,#3b82f6)]`
 * Где переменная не задана (воркспейс не переопределял цвет) — берётся фолбэк
 * и вид ИДЕНТИЧЕН прежнему. Если переопределена (инжектор ниже ставит
 * `--acc-blue-main`) — применяется кастомный цвет.
 *
 * Tailwind не видит динамически собранные классы в исходниках → все они
 * перечислены в `accentSafelist()` (вызывается из tailwind.config.ts).
 *
 * ВАЖНО: и карты стилей, и safelist, и инжектор зовут ОДНИ И ТЕ ЖЕ билдеры —
 * строки гарантированно совпадают. Менять формы классов только здесь.
 *
 * Чистый модуль без alias-импортов — его тянет tailwind.config.ts.
 */

export type AccentSlug =
  | 'blue'
  | 'slate'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'orange'
  | 'cyan'
  | 'pink'
  | 'indigo'
  | 'green'
  | 'sky'
  | 'brown'
  | 'taupe'
  | 'red'
  | 'black'
  | 'graphite'

/** Базовые цвета: main (солид) + light (бледный фон) = текущие значения. */
export const DEFAULT_ACCENT_HEX: Record<AccentSlug, { main: string; light: string }> = {
  blue: { main: '#3b82f6', light: '#dbeafe' },
  slate: { main: '#57534e', light: '#f5f5f4' },
  emerald: { main: '#059669', light: '#d1fae5' },
  amber: { main: '#f59e0b', light: '#fef3c7' },
  rose: { main: '#ef4444', light: '#fee2e2' },
  violet: { main: '#7c3aed', light: '#ede9fe' },
  orange: { main: '#f97316', light: '#ffedd5' },
  cyan: { main: '#0891b2', light: '#cffafe' },
  pink: { main: '#ec4899', light: '#fce7f3' },
  indigo: { main: '#4f46e5', light: '#e0e7ff' },
  green: { main: '#22c55e', light: '#dcfce7' },
  sky: { main: '#0ea5e9', light: '#e0f2fe' },
  brown: { main: '#92400e', light: '#fef3c7' },
  taupe: { main: '#78716c', light: '#f5f5f4' },
  red: { main: '#b91c1c', light: '#fee2e2' },
  black: { main: '#171717', light: '#e5e5e5' },
  graphite: { main: '#525252', light: '#f5f5f5' },
}

export const ACCENT_SLUGS = Object.keys(DEFAULT_ACCENT_HEX) as AccentSlug[]

const TEXT_ON_LIGHT = '#111827' // gray-900 — тёмный текст на светлом фоне (входящий бабл)

// ── Цветовая математика ────────────────────────────────────────────────────

function clampHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** Смешать цвет с белым: ratio=доля исходного (0..1). */
function mixWithWhite(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex)
  return `#${clampHex(r * ratio + 255 * (1 - ratio))}${clampHex(
    g * ratio + 255 * (1 - ratio),
  )}${clampHex(b * ratio + 255 * (1 - ratio))}`
}

/** Контрастный текст (белый/тёмный) по яркости фона. */
export function contrastText(hex: string): string {
  const [r, g, b] = parseHex(hex)
  // относительная яркость (sRGB, упрощённо)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#1f2937' : '#ffffff'
}

/** Полный набор производных тонов одного акцента (для инжектора и фолбэков). */
export function deriveAccentTones(main: string, light: string) {
  return {
    main,
    light,
    on: contrastText(main), // текст на солиде
    onlight: TEXT_ON_LIGHT, // текст на светлом (входящий бабл)
    soft: mixWithWhite(main, 0.12), // очень бледный (фон чипа реакции ~ -50)
    border: mixWithWhite(main, 0.3), // бледная рамка (~ -200)
  }
}

type ToneKey = keyof ReturnType<typeof deriveAccentTones>

/** Дефолтный фолбэк-hex тона по slug. */
function fallback(slug: AccentSlug, tone: ToneKey): string {
  const base = DEFAULT_ACCENT_HEX[slug]
  return deriveAccentTones(base.main, base.light)[tone]
}

/** Имя CSS-переменной тона. */
function varName(slug: AccentSlug, tone: ToneKey): string {
  return `--acc-${slug}-${tone}`
}

/** `var(--acc-blue-main,#3b82f6)` — переменная + дефолтный фолбэк. */
function cssVar(slug: AccentSlug, tone: ToneKey): string {
  return `var(${varName(slug, tone)},${fallback(slug, tone)})`
}

// ── Билдеры Tailwind arbitrary-классов (ЕДИНЫЙ источник для карт + safelist) ──

export const acc = {
  bgMain: (s: AccentSlug) => `bg-[${cssVar(s, 'main')}]`,
  bgLight: (s: AccentSlug) => `bg-[${cssVar(s, 'light')}]`,
  bgSoft: (s: AccentSlug) => `bg-[${cssVar(s, 'soft')}]`,
  textOn: (s: AccentSlug) => `text-[${cssVar(s, 'on')}]`,
  textOnLight: (s: AccentSlug) => `text-[${cssVar(s, 'onlight')}]`,
  textMain: (s: AccentSlug) => `text-[${cssVar(s, 'main')}]`,
  ringMain: (s: AccentSlug) => `ring-[${cssVar(s, 'main')}]`,
  borderMain: (s: AccentSlug) => `border-[${cssVar(s, 'main')}]`,
  borderSoft: (s: AccentSlug) => `border-[${cssVar(s, 'border')}]`,
  fromMain: (s: AccentSlug) => `from-[${cssVar(s, 'main')}]`,
  fromLight: (s: AccentSlug) => `from-[${cssVar(s, 'light')}]`,
  staffShadow: (s: AccentSlug) => `shadow-[inset_2px_0_0_${cssVar(s, 'main')}]`,
}

/** Полный список arbitrary-классов для tailwind safelist. */
export function accentSafelist(): string[] {
  const out: string[] = []
  for (const s of ACCENT_SLUGS) {
    for (const build of Object.values(acc)) out.push(build(s))
  }
  return out
}

// ── Переопределения воркспейса ───────────────────────────────────────────────

export type AccentOverride = { main?: string; light?: string }
export type AccentOverrides = Partial<Record<AccentSlug, AccentOverride>>

/** Превью-цвета для пикеров/настроек (override → иначе дефолт). */
export function resolveAccentHex(
  slug: AccentSlug,
  overrides?: AccentOverrides | null,
): { main: string; light: string } {
  const ov = overrides?.[slug]
  const base = DEFAULT_ACCENT_HEX[slug]
  return {
    main: ov?.main || base.main,
    light: ov?.light || base.light,
  }
}

/** CSS-строка `:root{...}` с переменными ТОЛЬКО переопределённых акцентов. */
export function buildAccentOverridesCss(overrides?: AccentOverrides | null): string {
  if (!overrides) return ''
  const decls: string[] = []
  for (const s of ACCENT_SLUGS) {
    const ov = overrides[s]
    if (!ov || (!ov.main && !ov.light)) continue
    const main = ov.main || DEFAULT_ACCENT_HEX[s].main
    const light = ov.light || DEFAULT_ACCENT_HEX[s].light
    const tones = deriveAccentTones(main, light)
    for (const tone of Object.keys(tones) as ToneKey[]) {
      decls.push(`${varName(s, tone)}:${tones[tone]};`)
    }
  }
  return decls.length ? `:root{${decls.join('')}}` : ''
}
