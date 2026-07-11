import { acc, ACCENT_SLUGS, type AccentSlug } from '@/lib/accentPalette'

// Единый источник — accentPalette.AccentSlug (+ legacy-алиас 'dark' для командного серого).
export type MessengerAccent = AccentSlug | 'dark'

/**
 * Светло-серый — ЕДИНЫЙ источник. Используется в двух местах:
 *  1) «светлая версия чёрного акцента» — incoming у тёмной темы (slate/dark);
 *  2) маркер сообщений «Команде»/«Заметка» во входящих КЛИЕНТСКИХ тредов.
 * Меняешь оттенок здесь — меняется в обоих местах одновременно.
 */
export const TEAM_GRAY = 'bg-stone-200/50 text-gray-900'

type BubbleStyle = {
  own: string
  /** Своя «Заметка» во ВНУТРЕННЕМ треде — акцент чуть засветлённый (opacity). */
  ownNote: string
  incoming: string
  ownTime: string
  replyBorder: string
  reaction: string
  /** Градиент для сворачивания длинных сообщений — свои бабблы (тёмный акцент). */
  fadeGradient: string
  /** Градиент для сворачивания — входящие бабблы (светлый акцент, под фон incoming). */
  fadeGradientIncoming: string
  /** Цвет левой полосы у входящих сообщений от сотрудника — совпадает с фоном «своего» баббла. */
  staffBorder: string
  /** Цвет ring-кольца аватара сотрудника — совпадает с фоном «своего» баббла. */
  staffRing: string
  /** 2px inset-полоса слева для бабла сотрудника. Используется как box-shadow,
   *  чтобы могла сосуществовать с border-l (полоса непрочитанного) рядом. */
  staffShadow: string
}

/** Стиль бабла из настраиваемых акцентных переменных (CSS var + фолбэк). */
function buildBubbleStyle(s: AccentSlug): BubbleStyle {
  return {
    own: `${acc.bgMain(s)} ${acc.textOn(s)}`,
    ownNote: `${acc.bgMain(s)} ${acc.textOn(s)}`,
    incoming: `${acc.bgLight(s)} ${acc.textOnLight(s)}`,
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: `${acc.bgSoft(s)} ${acc.borderSoft(s)} ${acc.textMain(s)}`,
    fadeGradient: acc.fromMain(s),
    fadeGradientIncoming: acc.fromLight(s),
    staffBorder: acc.borderMain(s),
    staffRing: acc.ringMain(s),
    staffShadow: acc.staffShadow(s),
  }
}

// Серый «командный» бабл — особый incoming (TEAM_GRAY), не из палитры.
const GRAY_BUBBLE: BubbleStyle = {
  own: 'bg-stone-600 text-white',
  ownNote: 'bg-stone-600/75 text-white',
  incoming: TEAM_GRAY,
  ownTime: 'text-white/50 justify-end',
  replyBorder: 'border-white/40',
  reaction: 'bg-stone-100 border-stone-300 text-stone-700',
  fadeGradient: 'from-stone-600/90',
  fadeGradientIncoming: 'from-stone-100/90',
  staffBorder: 'border-stone-600',
  staffRing: 'ring-stone-600',
  staffShadow: 'shadow-[inset_2px_0_0_#57534e]',
}

export const bubbleStyles: Record<string, BubbleStyle> = {
  ...Object.fromEntries(ACCENT_SLUGS.map((s) => [s, buildBubbleStyle(s)])),
  // slate/dark — «командный» серый (team-маркер), incoming = TEAM_GRAY.
  slate: GRAY_BUBBLE,
  dark: GRAY_BUBBLE,
}
