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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Mail,
  MessageSquare,
  CheckCircle2,
  Pin,
  PinOff,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
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
import { makeTabId } from './taskPanelTabs.types'

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
  /** Переупорядочить вкладку: вставить активную перед overId (или в конец, если null). */
  onReorder?: (activeId: string, overId: string | null) => void
}

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
  const lastPinnedId = useMemo(() => {
    const pinned = orderedTabs.filter((t) => t.pinned)
    return pinned.length > 0 ? pinned[pinned.length - 1].id : null
  }, [orderedTabs])

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // Pointer-based collision: предпочитаем droppable, в который реально попадает курсор.
  // Если ни один не попал (между табами) — fallback на rect-intersection.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const within = pointerWithin(args)
    if (within.length > 0) return within
    return rectIntersection(args)
  }, [])
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dropSide, setDropSide] = useState<'left' | 'right' | null>(null)
  // Реальная X-позиция курсора. dnd-kit-овский `activatorEvent.clientX + delta.x`
  // в нашем случае давал смещение (особенно когда панель в портале), поэтому
  // отслеживаем pointer через window-listener, активный только во время drag.
  const pointerXRef = useRef(0)
  useEffect(() => {
    if (!activeDragId) return
    const handler = (e: PointerEvent) => {
      pointerXRef.current = e.clientX
    }
    window.addEventListener('pointermove', handler)
    return () => window.removeEventListener('pointermove', handler)
  }, [activeDragId])

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
    const ev = e.activatorEvent as PointerEvent | undefined
    if (ev && typeof ev.clientX === 'number') pointerXRef.current = ev.clientX
  }, [])
  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { over } = e
    if (!over) {
      setOverId(null)
      setDropSide(null)
      return
    }
    const oid = String(over.id)
    setOverId(oid)
    if (oid === '__end__') {
      setDropSide('left')
      return
    }
    const rect = over.rect
    if (!rect) {
      setDropSide('left')
      return
    }
    const pointerX = pointerXRef.current
    const midX = rect.left + rect.width / 2
    setDropSide(pointerX < midX ? 'left' : 'right')
  }, [])
  const handleDragCancel = useCallback(() => {
    setActiveDragId(null)
    setOverId(null)
    setDropSide(null)
  }, [])
  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const aid = activeDragId
    const side = dropSide
    setActiveDragId(null)
    setOverId(null)
    setDropSide(null)
    if (!aid || !e.over || !onReorder) return
    const oid = String(e.over.id)
    if (oid === aid) return
    if (oid === '__end__') {
      onReorder(aid, null)
      return
    }
    // Если бросили в правую половину tab'а X — вставляем ПОСЛЕ X (т.е. перед следующим).
    let insertBeforeId: string | null = oid
    if (side === 'right') {
      const idx = orderedTabs.findIndex((t) => t.id === oid)
      const next = idx >= 0 ? orderedTabs[idx + 1] : null
      insertBeforeId = next ? next.id : null
    }
    onReorder(aid, insertBeforeId)
  }, [activeDragId, dropSide, onReorder, orderedTabs])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex items-center gap-1 px-2 h-9 border-b bg-gray-50/80 shrink-0 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          {orderedTabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isThread = tab.type === 'thread'
            const Icon = getTabIcon(tab)
            const accent = isThread && tab.meta?.accentColor
              ? getChatTabAccent(tab.meta.accentColor as ThreadAccentColor)
              : null
            const badge = isThread && tab.refId ? badgeByThreadId[tab.refId] : undefined
            const hasBadge = !!badge && badge.type !== 'none'
            return (
              <Fragment key={tab.id}>
                <DraggableTab
                  tab={tab}
                  isActive={isActive}
                  accent={accent}
                  Icon={Icon}
                  badge={badge}
                  hasBadge={hasBadge}
                  onActivate={onActivate}
                  onClose={onClose}
                  onTogglePin={onTogglePin}
                  indicator={overId === tab.id && activeDragId !== tab.id ? dropSide : null}
                />
                {/* Серый разделитель сразу после последней закреплённой вкладки —
                    но только если в баре есть и pinned, и unpinned. */}
                {tab.id === lastPinnedId && orderedTabs.some((t) => !t.pinned) && (
                  <div className="self-stretch w-px bg-gray-300 mx-1 shrink-0" aria-hidden />
                )}
              </Fragment>
            )
          })}
          <DropEnd activeDragId={activeDragId} />

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
                    onClick={() => {
                      if (isOpen) {
                        onActivate(makeTabId(def.type))
                      } else {
                        onOpenSystem(def)
                      }
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
  /** Где показать индикатор drop: 'left' / 'right' / null. */
  indicator: 'left' | 'right' | null
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
  indicator,
}: DraggableTabProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging, transform } = useDraggable({
    id: tab.id,
  })
  const { setNodeRef: setDropRef } = useDroppable({ id: tab.id })

  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }

  // Двигаем саму вкладку за курсором через CSS-transform — без отдельного DragOverlay,
  // чтобы движение было видно прямо в ряду табов.
  const dragStyle: React.CSSProperties | undefined = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setRefs}
          {...attributes}
          {...listeners}
          style={dragStyle}
          className={cn(
            'group relative flex items-center gap-1 rounded-full text-xs cursor-pointer min-w-0',
            // Закреплённые компактные: только иконка (+ бейдж/крестик), без текста.
            tab.pinned ? 'px-1.5 h-6 w-7 justify-center shrink-0' : 'pl-2 pr-1 h-6 min-w-[56px]',
            // Анимация только когда не тащим, иначе transform мешает плавному движению.
            !isDragging && 'transition-all',
            !tab.pinned && (isActive ? 'shrink-0' : 'shrink'),
            isActive
              ? cn(
                  'border border-gray-300 shadow-md ring-1 ring-black/5',
                  accent ? accent.active : 'bg-white text-foreground',
                )
              : 'text-muted-foreground hover:bg-white/70 hover:text-foreground',
            isDragging && 'shadow-2xl ring-2 ring-blue-500/60 cursor-grabbing scale-105 rotate-1',
          )}
          onClick={() => onActivate(tab.id)}
          title={tab.title}
        >
          {indicator === 'left' && (
            <div className="absolute -left-1 top-0 bottom-0 w-[3px] rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none animate-pulse" />
          )}
          {indicator === 'right' && (
            <div className="absolute -right-1 top-0 bottom-0 w-[3px] rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)] pointer-events-none animate-pulse" />
          )}
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
                    'absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full text-[9px] leading-none font-semibold text-white ring-1 ring-white',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value > 99 ? '99+' : badge.value}
                </span>
              )}
              {hasBadge && badge && badge.type === 'emoji' && (
                <span className="absolute -top-1 -right-1 text-[12px] leading-none">{badge.value}</span>
              )}
            </>
          ) : (
            <div className="relative w-4 h-4 shrink-0">
              {hasBadge && badge && badge.type === 'dot' && (
                <span
                  className={cn(
                    'absolute inset-0 rounded-full',
                    'group-hover:opacity-0 transition-opacity',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                />
              )}
              {hasBadge && badge && badge.type === 'number' && (
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center rounded-full text-[10px] leading-none font-semibold text-white px-1',
                    'group-hover:opacity-0 transition-opacity',
                    accent ? accent.badge : 'bg-blue-600',
                  )}
                >
                  {badge.value > 99 ? '99+' : badge.value}
                </span>
              )}
              {hasBadge && badge && badge.type === 'emoji' && (
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center text-[12px] leading-none',
                    'group-hover:opacity-0 transition-opacity',
                  )}
                >
                  {badge.value}
                </span>
              )}
              <button
                type="button"
                className={cn(
                  'absolute inset-0 flex items-center justify-center rounded-full hover:bg-gray-200 text-muted-foreground/70 hover:text-foreground',
                  hasBadge ? 'opacity-0 group-hover:opacity-100 transition-opacity' : '',
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
            </div>
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

/** Droppable-зона в самом конце ряда — позволяет бросить вкладку в конец. */
function DropEnd({ activeDragId }: { activeDragId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: '__end__' })
  if (!activeDragId) return null
  return (
    <div ref={setNodeRef} className="relative shrink-0 self-stretch w-4" aria-hidden>
      {isOver && (
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)] animate-pulse" />
      )}
    </div>
  )
}

export type { SystemTabDef }
