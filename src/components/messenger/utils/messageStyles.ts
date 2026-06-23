export type MessengerAccent =
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
  // Legacy aliases
  | 'green'
  | 'dark'

/**
 * Светло-серый — ЕДИНЫЙ источник. Используется в двух местах:
 *  1) «светлая версия чёрного акцента» — incoming у тёмной темы (slate/dark);
 *  2) маркер сообщений «Команде»/«Заметка» во входящих КЛИЕНТСКИХ тредов.
 * Меняешь оттенок здесь — меняется в обоих местах одновременно.
 */
export const TEAM_GRAY = 'bg-stone-200/50 text-gray-900'

export const bubbleStyles: Record<
  string,
  {
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
> = {
  blue: {
    own: 'bg-blue-500 text-white',
    ownNote: 'bg-blue-500/75 text-white',
    incoming: 'bg-blue-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-blue-50 border-blue-200 text-blue-700',
    fadeGradient: 'from-blue-500/90',
    fadeGradientIncoming: 'from-blue-100/90',
    staffBorder: 'border-blue-500',
    staffRing: 'ring-blue-500',
    staffShadow: 'shadow-[inset_2px_0_0_#3b82f6]',
  },
  slate: {
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
  },
  emerald: {
    own: 'bg-emerald-600 text-white',
    ownNote: 'bg-emerald-600/75 text-white',
    incoming: 'bg-emerald-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    fadeGradient: 'from-emerald-600/90',
    fadeGradientIncoming: 'from-emerald-100/90',
    staffBorder: 'border-emerald-600',
    staffRing: 'ring-emerald-600',
    staffShadow: 'shadow-[inset_2px_0_0_#059669]',
  },
  amber: {
    own: 'bg-amber-500 text-white',
    ownNote: 'bg-amber-500/75 text-white',
    incoming: 'bg-amber-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-amber-50 border-amber-200 text-amber-700',
    fadeGradient: 'from-amber-500/90',
    fadeGradientIncoming: 'from-amber-100/90',
    staffBorder: 'border-amber-500',
    staffRing: 'ring-amber-500',
    staffShadow: 'shadow-[inset_2px_0_0_#f59e0b]',
  },
  rose: {
    own: 'bg-red-500 text-white',
    ownNote: 'bg-red-500/75 text-white',
    incoming: 'bg-red-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-red-50 border-red-200 text-red-700',
    fadeGradient: 'from-red-500/90',
    fadeGradientIncoming: 'from-red-100/90',
    staffBorder: 'border-red-500',
    staffRing: 'ring-red-500',
    staffShadow: 'shadow-[inset_2px_0_0_#ef4444]',
  },
  violet: {
    own: 'bg-violet-600 text-white',
    ownNote: 'bg-violet-600/75 text-white',
    incoming: 'bg-violet-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-violet-50 border-violet-200 text-violet-700',
    fadeGradient: 'from-violet-600/90',
    fadeGradientIncoming: 'from-violet-100/90',
    staffBorder: 'border-violet-600',
    staffRing: 'ring-violet-600',
    staffShadow: 'shadow-[inset_2px_0_0_#7c3aed]',
  },
  orange: {
    own: 'bg-orange-500 text-white',
    ownNote: 'bg-orange-500/75 text-white',
    incoming: 'bg-orange-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-orange-50 border-orange-200 text-orange-700',
    fadeGradient: 'from-orange-500/90',
    fadeGradientIncoming: 'from-orange-100/90',
    staffBorder: 'border-orange-500',
    staffRing: 'ring-orange-500',
    staffShadow: 'shadow-[inset_2px_0_0_#f97316]',
  },
  cyan: {
    own: 'bg-cyan-600 text-white',
    ownNote: 'bg-cyan-600/75 text-white',
    incoming: 'bg-cyan-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    fadeGradient: 'from-cyan-600/90',
    fadeGradientIncoming: 'from-cyan-100/90',
    staffBorder: 'border-cyan-600',
    staffRing: 'ring-cyan-600',
    staffShadow: 'shadow-[inset_2px_0_0_#0891b2]',
  },
  pink: {
    own: 'bg-pink-500 text-white',
    ownNote: 'bg-pink-500/75 text-white',
    incoming: 'bg-pink-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-pink-50 border-pink-200 text-pink-700',
    fadeGradient: 'from-pink-500/90',
    fadeGradientIncoming: 'from-pink-100/90',
    staffBorder: 'border-pink-500',
    staffRing: 'ring-pink-500',
    staffShadow: 'shadow-[inset_2px_0_0_#ec4899]',
  },
  indigo: {
    own: 'bg-indigo-600 text-white',
    ownNote: 'bg-indigo-600/75 text-white',
    incoming: 'bg-indigo-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    fadeGradient: 'from-indigo-600/90',
    fadeGradientIncoming: 'from-indigo-100/90',
    staffBorder: 'border-indigo-600',
    staffRing: 'ring-indigo-600',
    staffShadow: 'shadow-[inset_2px_0_0_#4f46e5]',
  },
  // Legacy aliases
  green: {
    own: 'bg-green-600 text-white',
    ownNote: 'bg-green-600/75 text-white',
    incoming: 'bg-green-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-green-50 border-green-200 text-green-700',
    fadeGradient: 'from-green-600/90',
    fadeGradientIncoming: 'from-green-100/90',
    staffBorder: 'border-green-600',
    staffRing: 'ring-green-600',
    staffShadow: 'shadow-[inset_2px_0_0_#16a34a]',
  },
  dark: {
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
  },
}
