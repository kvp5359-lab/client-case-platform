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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  X,
  Check,
  BookOpen,
  Mail,
  MessageSquare,
  CheckCircle2,
  Menu,
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getChatIconComponent, getChatTabAccent } from '@/components/messenger/chatVisuals'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { BadgeDisplay } from '@/utils/inboxUnread'
import type { TaskPanelTab, TaskPanelTabType } from '@/types/taskPanelTabs'
import { SYSTEM_TABS, SYSTEM_TAB_BY_TYPE, type SystemTabDef } from './tab-bar/systemTabs'
import { DraggableTab } from './tab-bar/DraggableTab'
import { SortableSeparator, SEPARATOR_ID } from './tab-bar/SortableSeparator'

type TaskPanelTabBarProps = {
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

// SEPARATOR_ID импортирован из ./tab-bar/SortableSeparator

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
  if (tab.type === 'knowledge_article') return BookOpen
  return SYSTEM_TAB_BY_TYPE.get(tab.type)?.icon ?? MessageSquare
}

/** Строка вкладки в меню «бутерброд» — sortable (вертикально), крестик по наведению. */
function SortableTabRow({
  tab,
  isActive,
  Icon,
  onActivate,
  onClose,
  onCloseMenu,
}: {
  tab: TaskPanelTab
  isActive: boolean
  Icon: React.ComponentType<{ className?: string }>
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseMenu: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  })
  const style: React.CSSProperties = {
    // X залочен — список вертикальный.
    transform: transform ? CSS.Translate.toString({ ...transform, x: 0 }) : undefined,
    transition,
    zIndex: isDragging ? 50 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="menuitem"
      tabIndex={0}
      onClick={() => {
        onActivate(tab.id)
        onCloseMenu()
      }}
      className={cn(
        'group/row flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer select-none',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
        isDragging && 'bg-white shadow-md ring-1 ring-black/5',
      )}
    >
      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{tab.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose(tab.id)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-foreground hover:bg-black/5 transition-opacity"
        aria-label="Закрыть вкладку"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/** Разделитель закреплённых/обычных в меню — sortable-таргет (id = SEPARATOR_ID),
 *  без drag-листенеров: участвует в раскладке, но схватить нельзя. Дроп на него
 *  переключает закрепление (логика в handleDragEnd). */
function SortableMenuSeparator() {
  const { setNodeRef, transform, transition } = useSortable({ id: SEPARATOR_ID })
  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString({ ...transform, x: 0 }) : undefined,
    transition,
  }
  return <div ref={setNodeRef} style={style} className="my-1 h-px bg-border" />
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

    // Drop на разделитель = пользователь намеренно тащит таб через границу
    // зон, ожидая поменять зону. Переключаем pinned:
    //   • Был unpinned → становится pinned (в конец pinned).
    //   • Был pinned   → становится unpinned (в начало unpinned).
    // (До этого было «оставить в своей зоне» — выглядело как «вкладка
    //  отпружинила обратно», пользователь не понимал.)
    if (oid === SEPARATOR_ID) {
      const wasPinned = !!orderedTabs.find((t) => t.id === aid)?.pinned
      const becomePinned = !wasPinned
      if (becomePinned) {
        onReorder(aid, null, true) // null = в конец pinned после нормализации в reorderTab
      } else {
        const firstUnpinnedId = orderedTabs.find((t) => !t.pinned && t.id !== aid)?.id ?? null
        onReorder(aid, firstUnpinnedId, false)
      }
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

  // Прокрутка ленты вкладок колесом мыши: вертикальный wheel → горизонтальный
  // скролл. Нативный listener с passive:false, чтобы preventDefault сработал
  // (React onWheel — passive, preventDefault там не действует).
  const scrollRef = useRef<HTMLDivElement>(null)

  // Активная вкладка всегда видима: при смене активной — проматываем к ней.
  useEffect(() => {
    if (!activeTabId) return
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${activeTabId}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeTabId, orderedTabs])

  // Меню «бутерброд»: все вкладки списком (закреплённые / обычные) + доступные
  // для открытия системные разделы. Контролируемое, чтобы крестик закрытия
  // вкладки не схлопывал меню.
  const [listMenuOpen, setListMenuOpen] = useState(false)
  const pinnedTabs = useMemo(() => orderedTabs.filter((t) => t.pinned), [orderedTabs])
  const unpinnedTabs = useMemo(() => orderedTabs.filter((t) => !t.pinned), [orderedTabs])
  const availableSystemDefs = useMemo(
    () => visibleSystemDefs.filter((d) => !openedSystemTypes.has(d.type)),
    [visibleSystemDefs, openedSystemTypes],
  )

  const renderTabRow = (tab: TaskPanelTab) => (
    <SortableTabRow
      key={tab.id}
      tab={tab}
      isActive={tab.id === activeTabId}
      Icon={getTabIcon(tab)}
      onActivate={onActivate}
      onClose={onClose}
      onCloseMenu={() => setListMenuOpen(false)}
    />
  )
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Горизонтальный жест трекпада (deltaX) скроллит нативно — не трогаем.
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (el.scrollWidth <= el.clientWidth) return // нечего прокручивать
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center gap-1 px-2 h-10 border-b bg-gray-50/80 shrink-0 min-w-0">
        <div ref={scrollRef} className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-hide">
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
        </div>

        {/* «+» — вне прокручиваемой ленты вкладок, чтобы не уезжал при большом
            числе вкладок. */}
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

        {/* «Бутерброд» — список всех вкладок (закреплённые / обычные) + доступные
            для открытия разделы. */}
        <DropdownMenu open={listMenuOpen} onOpenChange={setListMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-white hover:text-foreground transition-colors shrink-0"
              aria-label="Все вкладки"
              title="Все вкладки"
            >
              <Menu className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto p-1">
            {orderedTabs.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Нет вкладок</div>
            )}
            {orderedTabs.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
                  {/* Порядок узлов = sortableItems: pinned → разделитель → unpinned.
                      Перетаскивание через разделитель меняет закрепление. */}
                  {pinnedTabs.length > 0 && (
                    <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      Закреплённые вкладки
                    </div>
                  )}
                  {pinnedTabs.map(renderTabRow)}
                  <SortableMenuSeparator />
                  {unpinnedTabs.map(renderTabRow)}
                </SortableContext>
              </DndContext>
            )}

            {availableSystemDefs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                  Добавить раздел
                </div>
                {availableSystemDefs.map((def) => {
                  const Icon = def.icon
                  return (
                    <div
                      key={def.type}
                      role="menuitem"
                      tabIndex={0}
                      // Только добавляем раздел во вкладки — меню НЕ закрываем,
                      // чтобы можно было добавить несколько подряд.
                      onClick={() => onOpenSystem(def)}
                      className="flex items-center gap-0 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-accent/60"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                      <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="flex-1">{def.title}</span>
                    </div>
                  )
                })}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

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

export type { SystemTabDef }
