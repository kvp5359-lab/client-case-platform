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
  Send,
  Plus,
  PlusCircle,
  Minus,
  MinusCircle,
  Folder,
  FolderPlus,
  FileText,
  Calendar,
  Clock,
  Tag,
  Bookmark,
  Flag,
  Pin,
  List,
  LayoutGrid,
  Inbox,
  Phone,
  Link2,
  Settings,
  UserPlus,
  Building2,
  Wallet,
  CreditCard,
  Target,
  TrendingUp,
  Rocket,
  Lightbulb,
  Archive,
  Search,
  Filter,
  Home,
  MapPin,
  Gift,
  Award,
  Package,
  ClipboardList,
  PieChart,
} from 'lucide-react'
import { WhatsAppIcon } from './brandIcons'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

/**
 * Палитра акцентов треда. Сгруппирована по парам оттенков (`group`) — пикер
 * рендерит группы с разделителями. `hidden` — legacy-значения (slate/cyan):
 * не показываются в пикере, но остаются в COLOR_BG/COLOR_TEXT ради уже
 * созданных тредов с этими цветами.
 */
export const ACCENT_COLORS: {
  value: ThreadAccentColor
  label: string
  bg: string
  ring: string
  group: string
  hidden?: boolean
}[] = [
  // Зелёные
  { value: 'emerald', label: 'Зелёный', bg: 'bg-emerald-600', ring: 'ring-emerald-600', group: 'green' },
  { value: 'green', label: 'Зелёный (свет.)', bg: 'bg-green-500', ring: 'ring-green-500', group: 'green' },
  // Синие
  { value: 'blue', label: 'Синий', bg: 'bg-blue-500', ring: 'ring-blue-500', group: 'blue' },
  { value: 'sky', label: 'Голубой', bg: 'bg-sky-500', ring: 'ring-sky-500', group: 'blue' },
  // Фиолетовые
  { value: 'violet', label: 'Фиолетовый', bg: 'bg-violet-600', ring: 'ring-violet-600', group: 'purple' },
  { value: 'indigo', label: 'Индиго', bg: 'bg-indigo-600', ring: 'ring-indigo-600', group: 'purple' },
  // Оранжевые
  { value: 'orange', label: 'Оранжевый', bg: 'bg-orange-500', ring: 'ring-orange-500', group: 'orange' },
  { value: 'amber', label: 'Жёлтый', bg: 'bg-amber-500', ring: 'ring-amber-500', group: 'orange' },
  // Коричневые
  { value: 'brown', label: 'Коричневый', bg: 'bg-amber-800', ring: 'ring-amber-800', group: 'brown' },
  { value: 'taupe', label: 'Серо-коричневый', bg: 'bg-stone-500', ring: 'ring-stone-500', group: 'brown' },
  // Красные
  { value: 'rose', label: 'Красный', bg: 'bg-red-500', ring: 'ring-red-500', group: 'red' },
  { value: 'red', label: 'Тёмно-красный', bg: 'bg-red-700', ring: 'ring-red-700', group: 'red' },
  // Чёрный / тёмно-серый
  { value: 'black', label: 'Чёрный', bg: 'bg-neutral-900', ring: 'ring-neutral-900', group: 'dark' },
  { value: 'graphite', label: 'Тёмно-серый', bg: 'bg-neutral-600', ring: 'ring-neutral-600', group: 'dark' },
  // Розовый (одиночный)
  { value: 'pink', label: 'Розовый', bg: 'bg-pink-500', ring: 'ring-pink-500', group: 'mono' },
  // Legacy — скрыты из пикера, сохранены для старых тредов
  { value: 'slate', label: 'Серый', bg: 'bg-stone-600', ring: 'ring-stone-600', group: 'legacy', hidden: true },
  { value: 'cyan', label: 'Бирюзовый', bg: 'bg-cyan-600', ring: 'ring-cyan-600', group: 'legacy', hidden: true },
]

/** Порядок видимых групп цветов для пикера (пары оттенков + одиночные). */
export const ACCENT_COLOR_GROUPS: string[] = ['green', 'blue', 'purple', 'orange', 'brown', 'red', 'dark', 'mono']

export const THREAD_ICONS: { value: string; icon: typeof MessageSquare; label: string }[] = [
  { value: 'message-square', icon: MessageSquare, label: 'Сообщение' },
  { value: 'mail', icon: Mail, label: 'Email' },
  { value: 'telegram', icon: Send, label: 'Telegram' },
  { value: 'whatsapp', icon: WhatsAppIcon as unknown as typeof MessageSquare, label: 'WhatsApp' },
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
  { value: 'plus', icon: Plus, label: 'Плюс' },
  { value: 'plus-circle', icon: PlusCircle, label: 'Плюс в круге' },
  { value: 'minus', icon: Minus, label: 'Минус' },
  { value: 'minus-circle', icon: MinusCircle, label: 'Минус в круге' },
  { value: 'folder', icon: Folder, label: 'Папка' },
  { value: 'folder-plus', icon: FolderPlus, label: 'Папка с плюсом' },
  { value: 'file-text', icon: FileText, label: 'Документ' },
  { value: 'clipboard-list', icon: ClipboardList, label: 'Список дел' },
  { value: 'list', icon: List, label: 'Список' },
  { value: 'layout-grid', icon: LayoutGrid, label: 'Сетка' },
  { value: 'calendar', icon: Calendar, label: 'Календарь' },
  { value: 'clock', icon: Clock, label: 'Часы' },
  { value: 'inbox', icon: Inbox, label: 'Входящие' },
  { value: 'tag', icon: Tag, label: 'Метка' },
  { value: 'bookmark', icon: Bookmark, label: 'Закладка' },
  { value: 'flag', icon: Flag, label: 'Флаг' },
  { value: 'pin', icon: Pin, label: 'Булавка' },
  { value: 'target', icon: Target, label: 'Цель' },
  { value: 'trending-up', icon: TrendingUp, label: 'Рост' },
  { value: 'pie-chart', icon: PieChart, label: 'Диаграмма' },
  { value: 'rocket', icon: Rocket, label: 'Ракета' },
  { value: 'lightbulb', icon: Lightbulb, label: 'Идея' },
  { value: 'gift', icon: Gift, label: 'Подарок' },
  { value: 'award', icon: Award, label: 'Награда' },
  { value: 'package', icon: Package, label: 'Коробка' },
  { value: 'phone', icon: Phone, label: 'Телефон' },
  { value: 'user-plus', icon: UserPlus, label: 'Добавить контакт' },
  { value: 'building', icon: Building2, label: 'Компания' },
  { value: 'wallet', icon: Wallet, label: 'Кошелёк' },
  { value: 'credit-card', icon: CreditCard, label: 'Карта' },
  { value: 'home', icon: Home, label: 'Дом' },
  { value: 'map-pin', icon: MapPin, label: 'Точка на карте' },
  { value: 'search', icon: Search, label: 'Поиск' },
  { value: 'filter', icon: Filter, label: 'Фильтр' },
  { value: 'archive', icon: Archive, label: 'Архив' },
  { value: 'settings', icon: Settings, label: 'Настройки' },
  { value: 'link', icon: Link2, label: 'Ссылка' },
]

/** Маппинг accent_color → Tailwind bg class */
export const COLOR_BG: Record<string, string> = Object.fromEntries(
  ACCENT_COLORS.map((c) => [c.value, c.bg]),
)

/** Маппинг accent_color → Tailwind text class.
 *  Record<ThreadAccentColor>: добавление акцента в union даёт ошибку компиляции
 *  здесь (а не молчаливый fallback). Индекс-сайты кастуют free-string accent. */
export const COLOR_TEXT: Record<ThreadAccentColor, string> = {
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
  green: 'text-green-600',
  sky: 'text-sky-600',
  brown: 'text-amber-800',
  taupe: 'text-stone-600',
  red: 'text-red-700',
  black: 'text-neutral-900',
  graphite: 'text-neutral-600',
}
