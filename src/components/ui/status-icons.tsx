/**
 * Библиотека иконок для статусов задач.
 * Каждая иконка рендерится в цвете статуса.
 */

import {
  Circle,
  CircleDot,
  CircleDashed,
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

export interface StatusIconDef {
  id: string
  icon: LucideIcon
  label: string
}

export const STATUS_ICONS: StatusIconDef[] = [
  { id: 'circle', icon: Circle, label: 'Пусто' },
  { id: 'circle-dot', icon: CircleDot, label: 'Точка' },
  { id: 'circle-dashed', icon: CircleDashed, label: 'Пунктир' },
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
]

const iconMap = new Map(STATUS_ICONS.map((i) => [i.id, i.icon]))

/** Получить Lucide-компонент по id иконки. Fallback — Circle */
export function getStatusIcon(iconId: string | null | undefined): LucideIcon {
  if (!iconId) return Circle
  return iconMap.get(iconId) ?? Circle
}
