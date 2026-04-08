/**
 * Общие константы для тредов: цвета, иконки.
 * Используются в ChatSettingsDialog, EditChatDialog, ThreadTemplateDialog,
 * ThreadTemplatesContent, ThreadTemplatePicker.
 */

import {
  MessageSquare,
  Mail,
  Users,
  Hash,
  Briefcase,
  Heart,
  Star,
  Shield,
  Zap,
  Globe,
  BookOpen,
  Headphones,
  Bell,
  Coffee,
  Flame,
  CheckSquare,
} from 'lucide-react'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

export const ACCENT_COLORS: {
  value: ThreadAccentColor
  label: string
  bg: string
  ring: string
}[] = [
  { value: 'blue', label: 'Синий', bg: 'bg-blue-500', ring: 'ring-blue-500' },
  { value: 'slate', label: 'Серый', bg: 'bg-stone-600', ring: 'ring-stone-600' },
  { value: 'emerald', label: 'Зелёный', bg: 'bg-emerald-600', ring: 'ring-emerald-600' },
  { value: 'amber', label: 'Жёлтый', bg: 'bg-amber-500', ring: 'ring-amber-500' },
  { value: 'rose', label: 'Красный', bg: 'bg-red-500', ring: 'ring-red-500' },
  { value: 'violet', label: 'Фиолетовый', bg: 'bg-violet-600', ring: 'ring-violet-600' },
  { value: 'orange', label: 'Оранжевый', bg: 'bg-orange-500', ring: 'ring-orange-500' },
  { value: 'cyan', label: 'Бирюзовый', bg: 'bg-cyan-600', ring: 'ring-cyan-600' },
  { value: 'pink', label: 'Малиновый', bg: 'bg-pink-500', ring: 'ring-pink-500' },
  { value: 'indigo', label: 'Индиго', bg: 'bg-indigo-600', ring: 'ring-indigo-600' },
]

export const THREAD_ICONS: { value: string; icon: typeof MessageSquare; label: string }[] = [
  { value: 'message-square', icon: MessageSquare, label: 'Сообщение' },
  { value: 'mail', icon: Mail, label: 'Email' },
  { value: 'users', icon: Users, label: 'Команда' },
  { value: 'hash', icon: Hash, label: 'Канал' },
  { value: 'briefcase', icon: Briefcase, label: 'Портфель' },
  { value: 'heart', icon: Heart, label: 'Сердце' },
  { value: 'star', icon: Star, label: 'Звезда' },
  { value: 'shield', icon: Shield, label: 'Щит' },
  { value: 'zap', icon: Zap, label: 'Молния' },
  { value: 'globe', icon: Globe, label: 'Глобус' },
  { value: 'book-open', icon: BookOpen, label: 'Книга' },
  { value: 'headphones', icon: Headphones, label: 'Наушники' },
  { value: 'bell', icon: Bell, label: 'Колокольчик' },
  { value: 'coffee', icon: Coffee, label: 'Кофе' },
  { value: 'flame', icon: Flame, label: 'Огонь' },
  { value: 'check-square', icon: CheckSquare, label: 'Чекбокс' },
]

/** Маппинг accent_color → Tailwind bg class */
export const COLOR_BG: Record<string, string> = Object.fromEntries(
  ACCENT_COLORS.map((c) => [c.value, c.bg]),
)

/** Маппинг accent_color → Tailwind text class */
export const COLOR_TEXT: Record<string, string> = {
  blue: 'text-blue-500',
  slate: 'text-stone-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-500',
  rose: 'text-red-500',
  violet: 'text-violet-600',
  orange: 'text-orange-500',
  cyan: 'text-cyan-600',
  pink: 'text-pink-500',
  indigo: 'text-indigo-600',
}
