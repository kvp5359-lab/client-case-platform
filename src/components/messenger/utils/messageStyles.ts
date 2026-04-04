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

export const bubbleStyles: Record<
  string,
  {
    own: string
    incoming: string
    ownTime: string
    replyBorder: string
    reaction: string
    fadeGradient: string
  }
> = {
  blue: {
    own: 'bg-blue-500 text-white',
    incoming: 'bg-blue-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-blue-50 border-blue-200 text-blue-700',
    fadeGradient: 'from-blue-500/90',
  },
  slate: {
    own: 'bg-stone-600 text-white',
    incoming: 'bg-stone-100/70 text-gray-900',
    ownTime: 'text-white/50 justify-end',
    replyBorder: 'border-white/40',
    reaction: 'bg-stone-100 border-stone-300 text-stone-700',
    fadeGradient: 'from-stone-600/90',
  },
  emerald: {
    own: 'bg-emerald-600 text-white',
    incoming: 'bg-emerald-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    fadeGradient: 'from-emerald-600/90',
  },
  amber: {
    own: 'bg-amber-500 text-white',
    incoming: 'bg-amber-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-amber-50 border-amber-200 text-amber-700',
    fadeGradient: 'from-amber-500/90',
  },
  rose: {
    own: 'bg-red-500 text-white',
    incoming: 'bg-red-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-red-50 border-red-200 text-red-700',
    fadeGradient: 'from-red-500/90',
  },
  violet: {
    own: 'bg-violet-600 text-white',
    incoming: 'bg-violet-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-violet-50 border-violet-200 text-violet-700',
    fadeGradient: 'from-violet-600/90',
  },
  orange: {
    own: 'bg-orange-500 text-white',
    incoming: 'bg-orange-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-orange-50 border-orange-200 text-orange-700',
    fadeGradient: 'from-orange-500/90',
  },
  cyan: {
    own: 'bg-cyan-600 text-white',
    incoming: 'bg-cyan-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    fadeGradient: 'from-cyan-600/90',
  },
  pink: {
    own: 'bg-pink-500 text-white',
    incoming: 'bg-pink-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-pink-50 border-pink-200 text-pink-700',
    fadeGradient: 'from-pink-500/90',
  },
  indigo: {
    own: 'bg-indigo-600 text-white',
    incoming: 'bg-indigo-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    fadeGradient: 'from-indigo-600/90',
  },
  // Legacy aliases
  green: {
    own: 'bg-green-600 text-white',
    incoming: 'bg-green-100/70 text-gray-900',
    ownTime: 'text-white/60 justify-end',
    replyBorder: 'border-white/50',
    reaction: 'bg-green-50 border-green-200 text-green-700',
    fadeGradient: 'from-green-600/90',
  },
  dark: {
    own: 'bg-stone-600 text-white',
    incoming: 'bg-stone-100/70 text-gray-900',
    ownTime: 'text-white/50 justify-end',
    replyBorder: 'border-white/40',
    reaction: 'bg-stone-100 border-stone-300 text-stone-700',
    fadeGradient: 'from-stone-600/90',
  },
}

/** Staff roles for yellow bubbles */
export const STAFF_ROLES = ['Администратор', 'Исполнитель']
