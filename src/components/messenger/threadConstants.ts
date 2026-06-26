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
import { acc, ACCENT_SLUGS } from '@/lib/accentPalette'

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
  { value: 'emerald', label: 'Зелёный', bg: acc.bgMain('emerald'), ring: acc.ringMain('emerald'), group: 'green' },
  { value: 'green', label: 'Зелёный (свет.)', bg: acc.bgMain('green'), ring: acc.ringMain('green'), group: 'green' },
  // Синие
  { value: 'blue', label: 'Синий', bg: acc.bgMain('blue'), ring: acc.ringMain('blue'), group: 'blue' },
  { value: 'sky', label: 'Голубой', bg: acc.bgMain('sky'), ring: acc.ringMain('sky'), group: 'blue' },
  // Фиолетовые
  { value: 'violet', label: 'Фиолетовый', bg: acc.bgMain('violet'), ring: acc.ringMain('violet'), group: 'purple' },
  { value: 'indigo', label: 'Индиго', bg: acc.bgMain('indigo'), ring: acc.ringMain('indigo'), group: 'purple' },
  // Оранжевые
  { value: 'orange', label: 'Оранжевый', bg: acc.bgMain('orange'), ring: acc.ringMain('orange'), group: 'orange' },
  { value: 'amber', label: 'Жёлтый', bg: acc.bgMain('amber'), ring: acc.ringMain('amber'), group: 'orange' },
  // Коричневые
  { value: 'brown', label: 'Коричневый', bg: acc.bgMain('brown'), ring: acc.ringMain('brown'), group: 'brown' },
  { value: 'taupe', label: 'Серо-коричневый', bg: acc.bgMain('taupe'), ring: acc.ringMain('taupe'), group: 'brown' },
  // Красные
  { value: 'rose', label: 'Красный', bg: acc.bgMain('rose'), ring: acc.ringMain('rose'), group: 'red' },
  { value: 'red', label: 'Тёмно-красный', bg: acc.bgMain('red'), ring: acc.ringMain('red'), group: 'red' },
  // Чёрный / тёмно-серый
  { value: 'black', label: 'Чёрный', bg: acc.bgMain('black'), ring: acc.ringMain('black'), group: 'dark' },
  { value: 'graphite', label: 'Тёмно-серый', bg: acc.bgMain('graphite'), ring: acc.ringMain('graphite'), group: 'dark' },
  // Розовый (одиночный)
  { value: 'pink', label: 'Розовый', bg: acc.bgMain('pink'), ring: acc.ringMain('pink'), group: 'mono' },
  // Legacy — скрыты из пикера, сохранены для старых тредов
  { value: 'slate', label: 'Серый', bg: acc.bgMain('slate'), ring: acc.ringMain('slate'), group: 'legacy', hidden: true },
  { value: 'cyan', label: 'Бирюзовый', bg: acc.bgMain('cyan'), ring: acc.ringMain('cyan'), group: 'legacy', hidden: true },
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
export const COLOR_TEXT: Record<ThreadAccentColor, string> = Object.fromEntries(
  ACCENT_SLUGS.map((s) => [s, acc.textMain(s)]),
) as Record<ThreadAccentColor, string>
