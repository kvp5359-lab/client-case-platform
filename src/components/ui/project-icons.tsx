/**
 * Библиотека иконок для типов проектов (project_templates.icon).
 *
 * Отображаются в сайдбаре для всех проектов соответствующего шаблона.
 * Цвет иконки задаётся динамически по цвету статуса конкретного проекта
 * (statuses.color). Если у проекта нет статуса — серый дефолт.
 *
 * Набор подобран максимально широкий: папки, документы, юридические,
 * деловые, коммуникация, недвижимость, финансы, общие категории.
 */

import {
  // Папки
  Folder,
  FolderOpen,
  FolderArchive,
  FolderHeart,
  FolderKanban,
  FolderLock,
  FolderClosed,
  FolderCheck,
  FolderSearch,
  FolderMinus,
  // Документы
  File,
  FileText,
  FileCheck,
  FileSignature,
  FileSearch,
  FileLock,
  FileBadge,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  Files,
  ClipboardList,
  ClipboardCheck,
  Paperclip,
  // Юридические / гос
  Scale,
  Gavel,
  Landmark,
  ShieldCheck,
  Shield,
  ShieldAlert,
  BadgeCheck,
  Stamp,
  BookOpen,
  Library,
  // Бизнес / работа
  Briefcase,
  Building,
  Building2,
  Factory,
  Store,
  HardHat,
  // Люди / клиенты
  User,
  Users,
  UserCheck,
  Contact,
  Handshake,
  // Финансы
  DollarSign,
  Wallet,
  CreditCard,
  Coins,
  Receipt,
  Banknote,
  PiggyBank,
  TrendingUp,
  // Коммуникация
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  // Недвижимость / переезд
  Home,
  House,
  Plane,
  Car,
  Truck,
  MapPin,
  Globe,
  Map as MapIcon,
  // Время / задачи
  Calendar,
  CalendarCheck,
  Clock,
  AlarmClock,
  Target,
  Flag,
  CheckSquare,
  ListChecks,
  // Общие / разное
  Star,
  Heart,
  Bookmark,
  Tag,
  Pin,
  Award,
  Trophy,
  Crown,
  Gem,
  Sparkles,
  Lightbulb,
  Zap,
  Flame,
  Rocket,
  Package,
  Box,
  Archive,
  Settings,
  Wrench,
  Key,
  Lock,
  // Образование / медицина
  GraduationCap,
  Stethoscope,
  HeartPulse,
  Pill,
  // Пища / отдых
  Coffee,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

import type { StatusIconDef } from '@/components/ui/status-icons'

/**
 * Набор иконок для типов проектов. ID — стабильные kebab-case строки,
 * хранятся в `project_templates.icon`. При добавлении новых иконок
 * НЕ менять существующие ID — на них завязаны записи в БД.
 */
export const PROJECT_ICONS: StatusIconDef[] = [
  // Папки
  { id: 'folder-open', icon: FolderOpen, label: 'Папка открытая' },
  { id: 'folder', icon: Folder, label: 'Папка' },
  { id: 'folder-closed', icon: FolderClosed, label: 'Папка закрытая' },
  { id: 'folder-check', icon: FolderCheck, label: 'Папка с галочкой' },
  { id: 'folder-search', icon: FolderSearch, label: 'Папка поиск' },
  { id: 'folder-lock', icon: FolderLock, label: 'Папка с замком' },
  { id: 'folder-heart', icon: FolderHeart, label: 'Папка с сердцем' },
  { id: 'folder-kanban', icon: FolderKanban, label: 'Папка канбан' },
  { id: 'folder-archive', icon: FolderArchive, label: 'Папка архив' },
  { id: 'folder-minus', icon: FolderMinus, label: 'Папка без проекта' },
  // Документы
  { id: 'file-text', icon: FileText, label: 'Документ' },
  { id: 'file', icon: File, label: 'Файл' },
  { id: 'files', icon: Files, label: 'Файлы' },
  { id: 'file-check', icon: FileCheck, label: 'Документ с галочкой' },
  { id: 'file-signature', icon: FileSignature, label: 'Подпись' },
  { id: 'file-search', icon: FileSearch, label: 'Поиск в документе' },
  { id: 'file-lock', icon: FileLock, label: 'Документ с замком' },
  { id: 'file-badge', icon: FileBadge, label: 'Сертификат' },
  { id: 'file-spreadsheet', icon: FileSpreadsheet, label: 'Таблица' },
  { id: 'file-image', icon: FileImage, label: 'Изображение' },
  { id: 'file-video', icon: FileVideo, label: 'Видео' },
  { id: 'clipboard-list', icon: ClipboardList, label: 'Список' },
  { id: 'clipboard-check', icon: ClipboardCheck, label: 'Чек-лист' },
  { id: 'paperclip', icon: Paperclip, label: 'Скрепка' },
  // Юридические / гос
  { id: 'scale', icon: Scale, label: 'Весы (юстиция)' },
  { id: 'gavel', icon: Gavel, label: 'Молоток судьи' },
  { id: 'landmark', icon: Landmark, label: 'Гос. учреждение' },
  { id: 'stamp', icon: Stamp, label: 'Печать' },
  { id: 'shield-check', icon: ShieldCheck, label: 'Защита' },
  { id: 'shield', icon: Shield, label: 'Щит' },
  { id: 'shield-alert', icon: ShieldAlert, label: 'Внимание защита' },
  { id: 'badge-check', icon: BadgeCheck, label: 'Проверено' },
  { id: 'book-open', icon: BookOpen, label: 'Книга открытая' },
  { id: 'library', icon: Library, label: 'Библиотека' },
  // Бизнес
  { id: 'briefcase', icon: Briefcase, label: 'Портфель' },
  { id: 'building', icon: Building, label: 'Здание' },
  { id: 'building-2', icon: Building2, label: 'Здание (офис)' },
  { id: 'factory', icon: Factory, label: 'Производство' },
  { id: 'store', icon: Store, label: 'Магазин' },
  { id: 'hard-hat', icon: HardHat, label: 'Каска (стройка)' },
  // Люди
  { id: 'user', icon: User, label: 'Пользователь' },
  { id: 'users', icon: Users, label: 'Группа' },
  { id: 'user-check', icon: UserCheck, label: 'Подтверждён' },
  { id: 'contact', icon: Contact, label: 'Контакт' },
  { id: 'handshake', icon: Handshake, label: 'Рукопожатие' },
  // Финансы
  { id: 'dollar-sign', icon: DollarSign, label: 'Доллар' },
  { id: 'wallet', icon: Wallet, label: 'Кошелёк' },
  { id: 'credit-card', icon: CreditCard, label: 'Карта' },
  { id: 'coins', icon: Coins, label: 'Монеты' },
  { id: 'receipt', icon: Receipt, label: 'Чек' },
  { id: 'banknote', icon: Banknote, label: 'Купюра' },
  { id: 'piggy-bank', icon: PiggyBank, label: 'Копилка' },
  { id: 'trending-up', icon: TrendingUp, label: 'Рост' },
  // Коммуникация
  { id: 'mail', icon: Mail, label: 'Почта' },
  { id: 'message-circle', icon: MessageCircle, label: 'Сообщение' },
  { id: 'message-square', icon: MessageSquare, label: 'Чат' },
  { id: 'phone', icon: Phone, label: 'Телефон' },
  { id: 'send', icon: Send, label: 'Отправлено' },
  // Недвижимость / переезд
  { id: 'home', icon: Home, label: 'Дом' },
  { id: 'house', icon: House, label: 'Дом (классический)' },
  { id: 'map-pin', icon: MapPin, label: 'Локация' },
  { id: 'globe', icon: Globe, label: 'Глобус' },
  { id: 'map', icon: MapIcon, label: 'Карта' },
  { id: 'plane', icon: Plane, label: 'Самолёт' },
  { id: 'car', icon: Car, label: 'Автомобиль' },
  { id: 'truck', icon: Truck, label: 'Грузовик' },
  // Время / задачи
  { id: 'calendar', icon: Calendar, label: 'Календарь' },
  { id: 'calendar-check', icon: CalendarCheck, label: 'Дата подтверждена' },
  { id: 'clock', icon: Clock, label: 'Часы' },
  { id: 'alarm-clock', icon: AlarmClock, label: 'Будильник' },
  { id: 'target', icon: Target, label: 'Цель' },
  { id: 'flag', icon: Flag, label: 'Флаг' },
  { id: 'check-square', icon: CheckSquare, label: 'Готово' },
  { id: 'list-checks', icon: ListChecks, label: 'Чек-лист задач' },
  // Образование / медицина
  { id: 'graduation-cap', icon: GraduationCap, label: 'Образование' },
  { id: 'stethoscope', icon: Stethoscope, label: 'Медицина' },
  { id: 'heart-pulse', icon: HeartPulse, label: 'Здоровье' },
  { id: 'pill', icon: Pill, label: 'Лекарство' },
  // Общие
  { id: 'star', icon: Star, label: 'Звезда' },
  { id: 'heart', icon: Heart, label: 'Сердце' },
  { id: 'bookmark', icon: Bookmark, label: 'Закладка' },
  { id: 'tag', icon: Tag, label: 'Метка' },
  { id: 'pin', icon: Pin, label: 'Закреплено' },
  { id: 'award', icon: Award, label: 'Награда' },
  { id: 'trophy', icon: Trophy, label: 'Трофей' },
  { id: 'crown', icon: Crown, label: 'Корона' },
  { id: 'gem', icon: Gem, label: 'Драгоценность' },
  { id: 'sparkles', icon: Sparkles, label: 'Искры' },
  { id: 'lightbulb', icon: Lightbulb, label: 'Идея' },
  { id: 'zap', icon: Zap, label: 'Молния' },
  { id: 'flame', icon: Flame, label: 'Огонь' },
  { id: 'rocket', icon: Rocket, label: 'Ракета' },
  { id: 'package', icon: Package, label: 'Посылка' },
  { id: 'box', icon: Box, label: 'Коробка' },
  { id: 'archive', icon: Archive, label: 'Архив' },
  { id: 'settings', icon: Settings, label: 'Настройки' },
  { id: 'wrench', icon: Wrench, label: 'Гаечный ключ' },
  { id: 'key', icon: Key, label: 'Ключ' },
  { id: 'lock', icon: Lock, label: 'Замок' },
  { id: 'coffee', icon: Coffee, label: 'Кофе' },
  { id: 'utensils', icon: Utensils, label: 'Питание' },
]

const iconMap = new Map(PROJECT_ICONS.map((i) => [i.id, i.icon]))

/**
 * Lucide-компонент иконки шаблона проекта по id.
 * Fallback — `FolderOpen` (старое поведение сайдбара до появления выбора иконки).
 */
export function getProjectIcon(iconId: string | null | undefined): LucideIcon {
  if (!iconId) return FolderOpen
  return iconMap.get(iconId) ?? FolderOpen
}
