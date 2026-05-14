"use client"

/**
 * TaskPanelTabBar — горизонтальный ряд вкладок сверху TaskPanel.
 *
 * Слева направо:
 *  - Открытые вкладки. Закреплённые (pinned) идут первыми и отделены тонким
 *    разделителем от обычных. Пин-иконка показывается слева от названия.
 *  - Контекстное меню по правому клику: «Закрепить/Открепить», «Закрыть».
 *  - Перетаскивание мышью переупорядочивает вкладки (внутри своей группы:
 *    pinned/unpinned). Для пересечения границы используется меню «Закрепить».
 *  - Кнопка [+] с меню системных разделов.
 *  - В правом углу — кнопка скрытия панели (✕).
 */

import { Fragment, useCallback, useMemo } from 'react'
import {
  Plus,
  X,
  Check,
  Bot,
  Settings2,
  History,
  FileText,
  ListChecks,
  FormInput,
  BookOpen,
  Lock,
  Mail,
  MessageSquare,
  CheckCircle2,
  Pin,
  PinOff,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { getChatIconComponent, getChatTabAccent } from '@/components/messenger/EditChatDialog'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import type { TaskPanelTab, TaskPanelTabType } from './taskPanelTabs.types'

interface SystemTabDef {
  type: Exclude<TaskPanelTabType, 'thread'>
  title: string
  icon: React.ComponentType<{ className?: string }>
}

const SYSTEM_TABS: SystemTabDef[] = [
  { type: 'tasks',      title: 'Задачи',             icon: ListChecks },
  { type: 'history',    title: 'История',            icon: History },
  { type: 'documents',  title: 'Документы',          icon: FileText },
  { type: 'forms',      title: 'Анкеты',             icon: FormInput },
  { type: 'materials',  title: 'Полезные материалы', icon: BookOpen },
  { type: 'project_context', title: 'Контекст проекта', icon: Lock },
  { type: 'assistant',  title: 'Ассистент',          icon: Bot },
  { type: 'extra',      title: 'Дополнительно',      icon: Settings2 },
]

const SYSTEM_TAB_BY_TYPE = new Map<string, SystemTabDef>(SYSTEM_TABS.map((d) => [d.type, d]))

interface TaskPanelTabBarProps {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onOpenSystem: (def: SystemTabDef) => void
  /** Что показать в бейдже per-thread: число, точка (manually_unread) или эмодзи. */
  badgeByThreadId?: Record<string, BadgeDisplay>
  /** Какие системные типы доступны пользователю по правам (для фильтра [+] меню). */
  visibleSystemTypes?: Set<TaskPanelTabType>
  /** Скрыть панель целиком (вкладки сохранятся). Кнопка «×» в правом углу. */
  onHidePanel?: () => void
  /** Переключить закрепление вкладки. */
  onTogglePin?: (id: string) => void
  /** Переупорядочить вкладку: вставить активную перед overId (или в конец, если null).
   *  pinned — финальный статус закрепления (определяется позицией относительно разделителя). */
  onReorder?: (activeId: string, overId: string | null, pinned: boolean) => void
}

const SEPARATOR_ID = '__pin_separator__'

/** Подобрать иконку для вкладки. */
function getTabIcon(tab: TaskPanelTab): React.ComponentType<{ className?: string }> {
  if (tab.type === 'thread') {
    if (tab.meta?.icon) {
      return getChatIconComponent(tab.meta.icon) as React.ComponentType<{ className?: string }>
    }
    const tt = tab.meta?.threadType
    if (tt === 'task') return CheckCircle2
    if (tt === 'email') return Mail
    return MessageSquare
  }
  return SYSTEM_TAB_BY_TYPE.get(tab.type)?.icon ?? MessageSquare
}

export function TaskPanelTabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onOpenSystem,
  badgeByThreadId = {},
  visibleSystemTypes,
  onHidePanel,
  onTogglePin,
  onReorder,
}: TaskPanelTabBarProps) {
  const visibleSystemDefs = useMemo(
    () =>
      visibleSystemTypes
        ? SYSTEM_TABS.filter((d) => visibleSystemTypes.has(d.type))
        : SYSTEM_TABS,
    [visibleSystemTypes],
  )
  const openedSystemTypes = useMemo(() => {
    const set = new Set<string>()
    for (const t of tabs) if (t.type !== 'thread') set.add(t.type)
    return set
  }, [tabs])

  // Сортировка: pinned первыми, остальные — после, в их относительном порядке.
  const orderedTabs = useMemo(() => {
    const pinned = tabs.filter((t) => t.pinned)
    const unpinned = tabs.filter((t) => !t.pinned)
    return [...pinned, ...unpinned]
  }, [tabs])
  // DnD: SortableContext двигает остальные элементы в стороны под курсором.
  // Разделитель — полноценный sortable-item (id = SEPARATOR_ID), но без drag-листенеров,
  // так что юзер не может его схватить. Зато он расступается вместе с соседями.
  // Позиция активной вкладки относительно разделителя в финальном порядке определяет pinned.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // Pointer-based collision: что под курсором — то и over. Иначе при перетаскивании
  // широкой unpinned-вкладки её центр перепрыгивает разделитель и попасть «между
  // последней pinned и разделителем» невозможно. Fallback на closestCenter для
  // случая, когда курсор вышел за пределы ряда.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const within = pointerWithin(args)
    if (within.length > 0) return within
    return closestCenter(args)
  }, [])
  const sortableItems = useMemo(() => {
    const pinnedIds = orderedTabs.filter((t) => t.pinned).map((t) => t.id)
    const unpinnedIds = orderedTabs.filter((t) => !t.pinned).map((t) => t.id)
    return [...pinnedIds, SEPARATOR_ID, ...unpinnedIds]
  }, [orderedTabs])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    if (!onReorder || !e.over) return
    const aid = String(e.active.id)
    const oid = String(e.over.id)
    if (aid === SEPARATOR_ID || aid === oid) return

    // Drop на разделитель: активная вкладка остаётся в своей зоне и встаёт в
    // её крайнюю позицию (в конец pinned либо в начало unpinned). Без этого
    // arrayMove кладёт активную после разделителя и логика «позиция относительно
    // разделителя определяет pinned» ошибочно меняет её сторону на противоположную.
    if (oid === SEPARATOR_ID) {
      const wasPinned = !!orderedTabs.find((t) => t.id === aid)?.pinned
      const firstUnpinnedId = orderedTabs.find((t) => !t.pinned && t.id !== aid)?.id ?? null
      onReorder(aid, firstUnpinnedId, wasPinned)
      return
    }

    const oldIndex = sortableItems.indexOf(aid)
    const newIndex = sortableItems.indexOf(oid)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(sortableItems, oldIndex, newIndex)
    const sepPos = next.indexOf(SEPARATOR_ID)
    const activePos = next.indexOf(aid)
    const pinned = activePos < sepPos
    // insertBeforeId — следующий за активной id, исключая разделитель.
    let insertBeforeId: string | null = null
    for (let i = activePos + 1; i < next.length; i++) {
      if (next[i] !== SEPARATOR_ID) { insertBeforeId = next[i]; break }
    }
    onReorder(aid, insertBeforeId, pinned)
  }, [onReorder, sortableItems, orderedTabs])

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center gap-1 px-2 h-10 border-b bg-gray-50/80 shrink-0 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          {sortableItems.map((id) => {
            if (id === SEPARATOR_ID) {
              return <SortableSeparator key={SEPARATOR_ID} />
            }
            const tab = orderedTabs.find((t) => t.id === id)
            if (!tab) return null
            const isActive = tab.id === activeTabId
            const isThread = tab.type === 'thread'
            const Icon = getTabIcon(tab)
            const accent = isThread && tab.meta?.accentColor
              ? getChatTabAccent(tab.meta.accentColor as ThreadAccentColor)
              : null
            const badge = isThread && tab.refId ? badgeByThreadId[tab.refId] : undefined
            const hasBadge = !!badge && badge.type !== 'none'
            return (
              <DraggableTab
                key={tab.id}
                tab={tab}
                isActive={isActive}
                accent={accent}
                Icon={Icon}
                badge={badge}
                hasBadge={hasBadge}
                onActivate={onActivate}
                onClose={onClose}
                onTogglePin={onTogglePin}
              />
            )
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-white hover:text-foreground transition-colors shrink-0"
                aria-label="Открыть раздел"
                title="Открыть раздел"
              >
                <Plus className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {visibleSystemDefs.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Нет доступных разделов
                </div>
              )}
              {visibleSystemDefs.map((def) => {
                const Icon = def.icon
                const isOpen = openedSystemTypes.has(def.type)
                return (
                  <DropdownMenuItem
                    key={def.type}
                    disabled={isOpen}
                    className={isOpen ? 'data-[disabled]:opacity-30' : ''}
                    onClick={() => {
                      if (isOpen) return
                      onOpenSystem(def)
                    }}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    <span className="flex-1">{def.title}</span>
                    {isOpen && <Check className="w-4 h-4 text-muted-foreground" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {onHidePanel && (
          <button
            type="button"
            onClick={onHidePanel}
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white border border-gray-200 transition-all duration-150 hover:scale-110 hover:rotate-90 hover:border-gray-300"
            title="Скрыть панель (вкладки сохранятся)"
            aria-label="Скрыть панель"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      </SortableContext>
    </DndContext>
  )
}

interface DraggableTabProps {
  tab: TaskPanelTab
  isActive: boolean
  accent: { active: string; badge: string } | null
  Icon: React.ComponentType<{ className?: string }>
  badge: BadgeDisplay | undefined
  hasBadge: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onTogglePin?: (id: string) => void
}

function DraggableTab({
  tab,
  isActive,
  accent,
  Icon,
  badge,
  hasBadge,
  onActivate,
  onClose,
  onTogglePin,
}: DraggableTabProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: tab.id,
  })

  // Y залочен: вкладка скользит только по горизонтали. Соседние вкладки сами
  // расступаются под курсором благодаря horizontalListSortingStrategy —
  // отдельный drop-индикатор не нужен.
  const dragStyle: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          style={dragStyle}
          className={cn(
            'group relative flex items-center gap-1 rounded-full text-xs cursor-pointer min-w-0',
            // Закреплённые компактные: только иконка (+ бейдж/крестик), без текста.
            tab.pinned ? 'px-1.5 h-6 w-7 justify-center shrink-0' : 'pl-2 pr-0.5 h-6 min-w-[80px]',
            !tab.pinned && (isActive ? 'shrink-0' : 'shrink'),
            isActive
              ? cn(
                  'border border-gray-300 shadow-md ring-1 ring-black/5',
                  accent ? accent.active : 'bg-white text-foreground',
                )
              : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
            isDragging && 'shadow-2xl ring-2 ring-blue-500/60 cursor-grabbing scale-105 z-50',
          )}
          onClick={() => onActivate(tab.id)}
          title={tab.title}
        >
          <Icon className="shrink-0 w-3.5 h-3.5" />
          {!tab.pinned && (
            <span className="truncate min-w-0 flex-1 max-w-[110px]">{tab.title}</span>
          )}

          {/* Бейдж и крестик. У pinned — мини-бейдж в углу (без места под крестик). */}
          {tab.pinned ? (
            <>
              {hasBadge && badge && badge.type === 'dot' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                />
              )}
              {hasBadge && badge && badge.type === 'number' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] leading-none font-semibold text-white ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value > 99 ? '99+' : badge.value}
                </span>
              )}
              {hasBadge && badge && badge.type === 'emoji' && (
                <span
                  className={cn(
                    'absolute -top-0.5 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[10px] leading-none ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value}
                </span>
              )}
            </>
          ) : (
            <>
              {/* Бейдж: занимает место в потоке только когда есть. На hover
                  скрывается, чтобы крестик визуально перекрыл его в той же позиции. */}
              {hasBadge && badge && (
                <div
                  className={cn(
                    'relative w-4 h-4 shrink-0 -ml-1',
                    'group-hover:opacity-0 transition-opacity',
                  )}
                >
                  {badge.type === 'dot' && (
                    <span
                      className={cn(
                        'absolute inset-0 rounded-full',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    />
                  )}
                  {badge.type === 'number' && (
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none font-semibold text-white px-1',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    >
                      {badge.value > 99 ? '99+' : badge.value}
                    </span>
                  )}
                  {badge.type === 'emoji' && (
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none',
                        accent ? accent.badge : 'bg-blue-600',
                      )}
                    >
                      {badge.value}
                    </span>
                  )}
                </div>
              )}
              {/* Крестик: появляется поверх правого края при hover, в потоке не
                  занимает места — текст вкладки получает чуть больше пространства. */}
              <button
                type="button"
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  isActive ? 'bg-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200',
                  'text-muted-foreground hover:text-foreground',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Закрыть вкладку"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onTogglePin && (
          <ContextMenuItem onClick={() => onTogglePin(tab.id)}>
            {tab.pinned ? (
              <>
                <PinOff className="w-3.5 h-3.5 mr-2" /> Открепить
              </>
            ) : (
              <>
                <Pin className="w-3.5 h-3.5 mr-2" /> Закрепить
              </>
            )}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onClose(tab.id)} className="text-destructive">
          <X className="w-3.5 h-3.5 mr-2" /> Закрыть
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Серый разделитель pinned/unpinned. Sortable, но без drag-листенеров —
 *  пользователь его не схватит, зато соседи расступаются вокруг него
 *  как и вокруг остальных вкладок. */
function SortableSeparator() {
  const { setNodeRef, transform, transition } = useSortable({ id: SEPARATOR_ID })
  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString({ ...transform, y: 0 }) : undefined,
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="self-stretch w-3 flex items-center justify-center shrink-0"
      aria-hidden
    >
      <div className="self-stretch w-px bg-gray-300" />
    </div>
  )
}

export type { SystemTabDef }
