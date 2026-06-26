"use client"

/**
 * Селектор видимости сообщения (Фаза 2). Компактный inline: выбранный режим
 * показан иконкой + текстом в его цвете, остальные три — только иконками.
 * Любой кликабелен. Цвет = цвет будущего бабла (палитра = аудитория).
 *
 * Шкала охвата: Всем → Команде → Заметка → Только я.
 */
import { useState, type ReactNode } from 'react'
import { MessageSquare, Users, BellOff, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessengerAccent } from './MessageBubble'
import { sendButtonStyles } from './MessageInputToolbar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type ComposerMode = 'client' | 'team' | 'note' | 'self'

/**
 * Светлая «пилюля» режима «Всем» под акцент треда (Tailwind не умеет
 * динамические имена классов — нужен статический разбор по акценту).
 */
const CLIENT_ACCENT_PILL: Record<MessengerAccent, { active: string; border: string }> = {
  blue: { active: 'bg-blue-100 text-blue-800', border: 'border-blue-300' },
  slate: { active: 'bg-stone-100 text-stone-800', border: 'border-stone-300' },
  emerald: { active: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-300' },
  amber: { active: 'bg-amber-100 text-amber-800', border: 'border-amber-300' },
  rose: { active: 'bg-rose-100 text-rose-800', border: 'border-rose-300' },
  violet: { active: 'bg-violet-100 text-violet-800', border: 'border-violet-300' },
  orange: { active: 'bg-orange-100 text-orange-800', border: 'border-orange-300' },
  cyan: { active: 'bg-cyan-100 text-cyan-800', border: 'border-cyan-300' },
  pink: { active: 'bg-pink-100 text-pink-800', border: 'border-pink-300' },
  indigo: { active: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-300' },
  green: { active: 'bg-green-100 text-green-800', border: 'border-green-300' },
  sky: { active: 'bg-sky-100 text-sky-800', border: 'border-sky-300' },
  brown: { active: 'bg-amber-100 text-amber-900', border: 'border-amber-400' },
  taupe: { active: 'bg-stone-100 text-stone-800', border: 'border-stone-300' },
  red: { active: 'bg-red-100 text-red-800', border: 'border-red-300' },
  black: { active: 'bg-neutral-200 text-neutral-900', border: 'border-neutral-400' },
  graphite: { active: 'bg-neutral-100 text-neutral-800', border: 'border-neutral-300' },
  dark: { active: 'bg-stone-100 text-stone-800', border: 'border-stone-300' },
}

/** Цвет кнопки отправки под выбранный режим (solid). «Всем» = акцент треда. */
export function composerSendButtonClass(mode: ComposerMode, accent: MessengerAccent): string {
  switch (mode) {
    case 'team':
      return 'bg-neutral-700 hover:bg-neutral-800 text-white'
    case 'note':
      return 'bg-neutral-400 hover:bg-neutral-500 text-white'
    case 'self':
      return 'bg-amber-500 hover:bg-amber-600 text-white'
    default:
      return sendButtonStyles[accent] ?? sendButtonStyles.blue
  }
}

/** Получатели/доступ — считается в MessengerTabContent, тянется лениво. */
export type NotifyRecipients = {
  loading: boolean
  /** Сотрудники с доступом к треду (видят), без себя и клиента. */
  accessStaff: string[]
  /** Из них подписаны — получат непрочитанное. */
  notifyStaff: string[]
  /** Доступные вне списка проекта (имя не разрешилось). */
  accessExtra: number
  /** Из них подписаны. */
  notifyExtra: number
  /** Есть клиент с доступом / внешний канал. */
  hasClient: boolean
}

/** Режим → что писать в сообщение (visibility + тихо/громко). */
export const MODE_VISIBILITY: Record<
  ComposerMode,
  { visibility: 'client' | 'team' | 'self'; notifySubscribers: boolean }
> = {
  client: { visibility: 'client', notifySubscribers: true },
  team: { visibility: 'team', notifySubscribers: true },
  note: { visibility: 'team', notifySubscribers: false },
  self: { visibility: 'self', notifySubscribers: false },
}

const MODES: {
  key: ComposerMode
  label: string
  Icon: LucideIcon
  active: string
  border: string
  title: string
}[] = [
  {
    key: 'client', label: 'Всем', Icon: MessageSquare,
    active: 'bg-blue-100 text-blue-800', border: 'border-blue-300',
    title: 'Клиент + команда · уходит в Telegram/email',
  },
  {
    key: 'team', label: 'Команде', Icon: Users,
    active: 'bg-neutral-700 text-white', border: 'border-neutral-700',
    title: 'Только команда · уведомляет подписчиков',
  },
  {
    key: 'note', label: 'Заметка', Icon: BellOff,
    active: 'bg-neutral-400 text-white', border: 'border-neutral-400',
    title: 'Только команда · тихо (лишь @теги)',
  },
  {
    key: 'self', label: 'Только я', Icon: Lock,
    active: 'bg-amber-100 text-amber-800', border: 'border-amber-300',
    title: 'Вижу только я · никого не уведомляет',
  },
]

/** «A, B и ещё N» с лимитом показа; «—» если пусто. */
function fmtNames(names: string[], extra: number): string {
  const shown = names.slice(0, 8)
  const overflow = names.length - shown.length + extra
  if (shown.length === 0) return overflow > 0 ? `${overflow} чел.` : '—'
  return `${shown.join(', ')}${overflow > 0 ? ` и ещё ${overflow}` : ''}`
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-0.5">
      <span className="opacity-60">{label}: </span>
      {children}
    </div>
  )
}

/** Содержимое подсказки: две части — «Уведомление» и «Доступ». */
function RecipientsTooltip({ mode, r }: { mode: ComposerMode; r?: NotifyRecipients }) {
  if (mode === 'self') {
    return (
      <>
        <Row label="Уведомление">никто</Row>
        <Row label="Доступ">только вы</Row>
      </>
    )
  }
  if (!r || r.loading) return <span className="opacity-80">Загрузка…</span>

  const hasTeam = r.accessStaff.length > 0 || r.accessExtra > 0
  const hasNotify = r.notifyStaff.length > 0 || r.notifyExtra > 0
  // Нет другой команды (личный диалог) → доступ только у тебя.
  const accessLine = hasTeam ? `команда — ${fmtNames(r.accessStaff, r.accessExtra)}` : 'только вы'
  const notify = fmtNames(r.notifyStaff, r.notifyExtra)

  if (mode === 'note') {
    return (
      <>
        <Row label="Уведомление">
          никто · только <b>@упомянутые</b>
        </Row>
        <Row label="Доступ">{accessLine}</Row>
      </>
    )
  }
  if (mode === 'team') {
    return (
      <>
        <Row label="Уведомление">{hasNotify ? notify : 'никто'}</Row>
        <Row label="Доступ">{accessLine}</Row>
      </>
    )
  }
  // client / «Всем»
  return (
    <>
      <Row label="Уведомление">
        клиент (внешний канал){hasNotify ? `, ${notify}` : ''}
      </Row>
      <Row label="Доступ">клиент{hasTeam ? ` + команда — ${fmtNames(r.accessStaff, r.accessExtra)}` : ''}</Row>
    </>
  )
}

export function ComposerVisibilitySwitch({
  mode,
  onChange,
  allowClient = true,
  accent = 'blue',
  recipients,
  onPrimeRecipients,
}: {
  mode: ComposerMode
  onChange: (mode: ComposerMode) => void
  /** В тредах без клиента режим «Клиенту» прячем (отправлять некому). */
  allowClient?: boolean
  /** Акцент треда — режим «Всем» окрашивается под него. */
  accent?: MessengerAccent
  /** Кто получит уведомление (для подсказки при наведении). */
  recipients?: NotifyRecipients
  /** Зовётся при первом наведении — лениво подтянуть подписчиков. */
  onPrimeRecipients?: () => void
}) {
  const modes = allowClient ? MODES : MODES.filter((m) => m.key !== 'client')
  // «Всем» (client) красим под акцент треда; остальные режимы — статично.
  const activeOf = (m: (typeof MODES)[number]) =>
    m.key === 'client' ? CLIENT_ACCENT_PILL[accent].active : m.active
  const borderOf = (m: (typeof MODES)[number]) =>
    m.key === 'client' ? CLIENT_ACCENT_PILL[accent].border : m.border
  const activeBorder = modes.find((m) => m.key === mode)
    ? borderOf(modes.find((m) => m.key === mode)!)
    : 'border-border'
  // Контролируемый hover: соседние Radix-Tooltip со своим таймингом не
  // переключаются при переводе мыши. Единый `hovered` → переключение мгновенное.
  const [hovered, setHovered] = useState<ComposerMode | null>(null)

  return (
    <TooltipProvider>
      <div
        className={cn(
          'inline-flex items-stretch h-6 rounded-full border overflow-hidden bg-white/80 backdrop-blur-sm shadow-[0_0_18px_6px_rgba(255,255,255,0.9)]',
          activeBorder,
        )}
      >
        {modes.map((m, i) => {
          const isActive = m.key === mode
          const Icon = m.Icon
          return (
            <Tooltip key={m.key} open={hovered === m.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onChange(m.key)}
                  onMouseEnter={() => {
                    setHovered(m.key)
                    onPrimeRecipients?.()
                  }}
                  onMouseLeave={() => setHovered((h) => (h === m.key ? null : h))}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
                    isActive ? cn('px-2.5', activeOf(m)) : 'px-2 text-muted-foreground hover:bg-muted',
                    i > 0 && 'border-l border-border',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {isActive && m.label}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className={cn('max-w-[260px] leading-snug border', activeOf(m), borderOf(m))}
              >
                <div className="font-medium mb-0.5">{m.label}</div>
                <RecipientsTooltip mode={m.key} r={recipients} />
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
