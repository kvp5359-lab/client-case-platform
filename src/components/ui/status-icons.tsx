/**
 * Библиотека иконок для статусов задач.
 * Каждая иконка рендерится в цвете статуса.
 */

import { forwardRef } from 'react'
import {
  Circle,
  CircleDot,
  CircleDashed,
  Disc,
  Disc2,
  Disc3,
  Clock,
  Loader,
  Play,
  Pause,
  Square,
  CheckCircle2,
  CheckSquare2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Send,
  RotateCcw,
  Ban,
  Hourglass,
  type LucideIcon,
} from 'lucide-react'

const CircleFilled = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  (props, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />
    </svg>
  ),
) as LucideIcon
CircleFilled.displayName = 'CircleFilled'

const SquareFilled = forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  (props, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  ),
) as LucideIcon
SquareFilled.displayName = 'SquareFilled'

export interface StatusIconDef {
  id: string
  icon: LucideIcon
  label: string
}

export const STATUS_ICONS: StatusIconDef[] = [
  { id: 'circle', icon: Circle, label: 'Пусто' },
  { id: 'circle-filled', icon: CircleFilled, label: 'Круг заполненный' },
  { id: 'circle-dot', icon: CircleDot, label: 'Точка' },
  { id: 'circle-dashed', icon: CircleDashed, label: 'Пунктир' },
  { id: 'disc', icon: Disc, label: 'Диск (толстый)' },
  { id: 'disc-2', icon: Disc2, label: 'Диск' },
  { id: 'disc-3', icon: Disc3, label: 'Пластинка' },
  { id: 'clock', icon: Clock, label: 'Часы' },
  { id: 'hourglass', icon: Hourglass, label: 'Песочные часы' },
  { id: 'loader', icon: Loader, label: 'Загрузка' },
  { id: 'play', icon: Play, label: 'Запуск' },
  { id: 'pause', icon: Pause, label: 'Пауза' },
  { id: 'send', icon: Send, label: 'Отправлено' },
  { id: 'eye', icon: Eye, label: 'На проверке' },
  { id: 'eye-off', icon: EyeOff, label: 'Скрыто' },
  { id: 'help-circle', icon: HelpCircle, label: 'Вопрос' },
  { id: 'alert-circle', icon: AlertCircle, label: 'Внимание' },
  { id: 'check-circle', icon: CheckCircle2, label: 'Готово' },
  { id: 'check-square', icon: CheckSquare2, label: 'Выполнено' },
  { id: 'x-circle', icon: XCircle, label: 'Отклонено' },
  { id: 'ban', icon: Ban, label: 'Отменено' },
  { id: 'rotate-ccw', icon: RotateCcw, label: 'Возврат' },
  { id: 'square', icon: Square, label: 'Квадрат' },
  { id: 'square-filled', icon: SquareFilled, label: 'Квадрат заполненный' },
]

const iconMap = new Map(STATUS_ICONS.map((i) => [i.id, i.icon]))

/** Получить Lucide-компонент по id иконки. Fallback — Circle */
export function getStatusIcon(iconId: string | null | undefined): LucideIcon {
  if (!iconId) return Circle
  return iconMap.get(iconId) ?? Circle
}
