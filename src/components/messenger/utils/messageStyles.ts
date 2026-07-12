import { acc, ACCENT_SLUGS, type AccentSlug } from '@/lib/accentPalette'
import { isStaffRole } from '@/types/permissions'
import type { MessageVisibility } from '@/services/api/messenger/messengerService.types'

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

// ── Раскраска бабла по видимости×направлению×типу треда — ЕДИНОЕ место ──
// Раньше эти вычисления были инлайном в теле MessageBubble (~120 строк) — самый
// частый класс UI-багов «не тот цвет/маркер». Теперь одна чистая функция:
// «где считается вид бабла» = здесь. Логика перенесена дословно.

export type BubbleAppearanceInput = {
  accent: string
  visibility: MessageVisibility | null | undefined
  notifySubscribers: boolean | null | undefined
  senderRole: string | null | undefined
  isDraft: boolean
  isOwn: boolean
  isClientThread: boolean
  viewerIsClient: boolean
  /** Доставка провалена (для pill-фона таймстампа). */
  deliveryFailed: boolean
}

export type BubbleAppearance = {
  ownBubbleClass: string
  incomingBubbleClass: string
  /** Показать маркер «Только я» (жёлтый) — только у своих. */
  showVisMarkSelf: boolean
  /** Показать маркер «Заметка» (🔕) — только у своих. */
  showVisMarkNote: boolean
  /** Показать staff-подсветку (кольцо/полоса) у входящего сообщения сотрудника. */
  showStaffMark: boolean
  staffRingColor: string
  staffBorderColor: string
  /** Фон pill'а таймстампа поверх картинки (повторяет фон бабла). */
  timestampPillBg: string
}

function bgClassOf(classes: string): string {
  return classes.split(' ').find((c) => c.startsWith('bg-')) ?? ''
}

export function resolveBubbleAppearance(i: BubbleAppearanceInput): BubbleAppearance {
  const colors = bubbleStyles[i.accent]
  const vis = i.visibility ?? 'client'
  const isSelfVis = vis === 'self'
  const isTeamVis = vis === 'team'
  // «Заметка» = team + тихо (notify_subscribers=false).
  const isNoteVis = isTeamVis && i.notifySubscribers === false
  const clientThread = i.isClientThread

  const ownBubbleClass = isSelfVis
    ? 'bg-amber-200 text-amber-950'
    : clientThread
      ? isNoteVis
        ? 'bg-neutral-600 text-neutral-50' // заметка в клиентском треде — тёмно-серый
        : isTeamVis
          ? 'bg-neutral-900 text-neutral-50' // команде в клиентском треде — чёрный
          : colors.own // всем — акцент
      : isNoteVis
        ? colors.ownNote // заметка во внутреннем — акцент засветлённый
        : colors.own // всем/команде во внутреннем — акцент

  const incomingBubbleClass = clientThread && isTeamVis ? TEAM_GRAY : colors.incoming

  const staffRingColor = isNoteVis
    ? 'ring-neutral-600'
    : isTeamVis
      ? 'ring-neutral-900'
      : colors.staffRing
  const staffBorderColor = isNoteVis
    ? 'border-neutral-600'
    : isTeamVis
      ? 'border-neutral-900'
      : colors.staffBorder

  const timestampPillBg = i.isDraft
    ? 'bg-white'
    : i.isOwn
      ? i.deliveryFailed
        ? 'bg-white'
        : bgClassOf(colors.own)
      : bgClassOf(colors.incoming)

  return {
    ownBubbleClass,
    incomingBubbleClass,
    showVisMarkSelf: i.isOwn && isSelfVis,
    showVisMarkNote: i.isOwn && isNoteVis,
    showStaffMark: i.isClientThread && !i.viewerIsClient && isStaffRole(i.senderRole ?? ''),
    staffRingColor,
    staffBorderColor,
    timestampPillBg,
  }
}
