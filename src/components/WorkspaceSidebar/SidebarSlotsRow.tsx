"use client"

/**
 * SidebarSlotsRow — общий рендерер ряда слотов сайдбара (топбар-иконки
 * или полные пункты списка). Один компонент покрывает оба режима через
 * `compact`. Папки (`type='folder'`) рендерятся как кнопка/строка; клик
 * открывает popover со списком вложенных слотов. Внутри папки —
 * 1 уровень, гнездование запрещено на уровне типа.
 */

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Folder as FolderIcon, FolderOpen, FolderTree, Kanban, ListChecks, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarNavButton } from './SidebarNavButton'
import type { ItemList } from '@/hooks/useItemLists'
import {
  SIDEBAR_NAV_ITEMS,
  boardIdFromSlotId,
  childrenOfFolder,
  getBadgeColorMeta,
  listIdFromSlotId,
  sectionIdFromSlotId,
  navKeyFromSlotId,
  quickActionIdFromSlotId,
  slotRef,
  topLevelSlots,
  type SidebarBadgeMode,
  type SidebarNavKey,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { useActiveInterfacePreset } from '@/hooks/useInterfacePresets'
import { useQuickActionsRunner } from '@/components/quick-actions/QuickActionsProvider'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'

type SidebarSlotsRowProps = {
  /** ВСЕ слоты зоны (топбар или список), включая папки и их детей. */
  slots: SidebarSlot[]
  compact: boolean
  /** Направление рендера. По умолчанию: compact='row', обычный='column'. */
  direction?: 'row' | 'column'
  allBoards: { id: string; name: string; short_id: number | null }[] | undefined
  allItemLists: ItemList[] | undefined
  allSections: { id: string; name: string }[] | undefined
  isOwner: boolean
  pathname: string
  buildHref: (path: string) => string
  computeBadge: (mode: SidebarBadgeMode) => string | undefined
  isNavActive: (href: string) => boolean
  isNavItemActive: (key: SidebarNavKey, listSlots: SidebarSlot[]) => boolean
  /** Контекст «list-slots» для isNavItemActive — нужен ему для приоритета overlap'ов. */
  listSlots: SidebarSlot[]
  toggleBoardPin: (boardId: string) => void
  toggleListPin: (listId: string) => void
  /** Для слотов-кнопок быстрых действий (quickaction). */
  workspaceId?: string
}

export function SidebarSlotsRow(props: SidebarSlotsRowProps) {
  const { slots, compact, direction } = props
  const top = topLevelSlots(slots)
  if (top.length === 0) return null

  const effectiveDir = direction ?? (compact ? 'row' : 'column')
  const wrapperClass =
    effectiveDir === 'row' ? 'flex items-center justify-between gap-[1px]' : ''
  const wrapperStyle =
    effectiveDir === 'row'
      ? undefined
      : { display: 'flex', flexDirection: 'column' as const, gap: '1px' }

  return (
    <nav className={wrapperClass} style={wrapperStyle}>
      {top.map((slot) => {
        if (slot.type === 'folder') {
          return <FolderSlot key={slot.id} folder={slot} allSlots={slots} {...props} />
        }
        return <SingleSlot key={slot.id} slot={slot} {...props} />
      })}
    </nav>
  )
}

// ── Renderer одного «не-папочного» слота (nav / board / list) ────────

function SingleSlot({
  slot,
  compact,
  allBoards,
  allItemLists,
  allSections,
  isOwner,
  pathname,
  buildHref,
  computeBadge,
  isNavActive,
  isNavItemActive,
  listSlots,
  toggleBoardPin,
  toggleListPin,
  workspaceId,
}: { slot: SidebarSlot } & SidebarSlotsRowProps) {
  const badge = computeBadge(slot.badge_mode)
  const searchParams = useSearchParams()

  if (slot.type === 'quickaction') {
    return <QuickActionSlotButton slot={slot} compact={compact} workspaceId={workspaceId} />
  }

  if (slot.type === 'link') {
    return <LinkSlotButton slot={slot} compact={compact} buildHref={buildHref} />
  }

  if (slot.type === 'section') {
    const sectionId = sectionIdFromSlotId(slotRef(slot))!
    const section = allSections?.find((s) => s.id === sectionId)
    if (!section) return null
    return (
      <SidebarNavButton
        icon={FolderTree}
        label={section.name}
        href={`${buildHref('boards')}?section=${sectionId}`}
        badge={badge}
        badgeColor={slot.badge_color}
        isActive={pathname.includes('/boards') && searchParams.get('section') === sectionId}
        compact={compact || undefined}
      />
    )
  }

  if (slot.type === 'nav') {
    const key = navKeyFromSlotId(slotRef(slot))!
    const meta = SIDEBAR_NAV_ITEMS[key]
    return (
      <SidebarNavButton
        icon={meta.icon}
        label={meta.label}
        href={buildHref(meta.path)}
        badge={badge}
        badgeColor={slot.badge_color}
        isActive={isNavItemActive(key, listSlots)}
        compact={compact || undefined}
      />
    )
  }

  if (slot.type === 'board') {
    const boardId = boardIdFromSlotId(slotRef(slot))!
    const board = allBoards?.find((b) => b.id === boardId)
    if (!board) return null
    const hoverSlot =
      !compact && isOwner ? (
        <button
          type="button"
          className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
          title="Открепить"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            toggleBoardPin(board.id)
          }}
        >
          <PinOff className="h-[14px] w-[14px]" />
        </button>
      ) : undefined
    // URL доски может быть и с UUID, и с short_id (на subdomain'е активны
    // короткие пути типа /boards/1). Подсвечиваем при совпадении любого варианта.
    const isThisBoardActive =
      pathname.includes(`/boards/${board.id}`) ||
      (board.short_id != null && pathname.includes(`/boards/${board.short_id}`))
    const button = (
      <SidebarNavButton
        icon={Kanban}
        label={board.name}
        href={buildHref(`boards/${board.id}`)}
        badge={badge}
        badgeColor={slot.badge_color}
        isActive={isNavActive('boards') && isThisBoardActive}
        compact={compact || undefined}
        hoverIconSlot={hoverSlot}
      />
    )
    return compact ? <div>{button}</div> : <div className="group/pin">{button}</div>
  }

  // type === 'list'
  const listId = listIdFromSlotId(slotRef(slot))!
  const list = allItemLists?.find((l) => l.id === listId)
  if (!list) return null
  const hoverSlot =
    !compact && isOwner ? (
      <button
        type="button"
        className="p-0.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-200/60"
        title="Открепить"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggleListPin(list.id)
        }}
      >
        <PinOff className="h-[14px] w-[14px]" />
      </button>
    ) : undefined
  const Icon = list.entity_type === 'project' ? FolderOpen : ListChecks
  const button = (
    <SidebarNavButton
      icon={Icon}
      label={list.name}
      href={buildHref(`boards/list-${list.id}`)}
      badge={badge}
      isActive={pathname.includes(`/boards/list-${list.id}`)}
      compact={compact || undefined}
      hoverIconSlot={hoverSlot}
    />
  )
  return compact ? <div>{button}</div> : <div className="group/pin">{button}</div>
}

// ── Renderer кнопки быстрого действия (quickaction) ─────────────────

function QuickActionSlotButton({
  slot,
  compact,
  workspaceId,
}: {
  slot: SidebarSlot
  compact: boolean
  workspaceId: string | undefined
}) {
  const { quickActions } = useActiveInterfacePreset(workspaceId)
  const { run } = useQuickActionsRunner()
  const actionId = quickActionIdFromSlotId(slotRef(slot))
  const action = quickActions.find((a) => a.id === actionId)
  if (!action) return null
  const m = { Icon: getChatIconComponent(action.icon) }

  if (compact) {
    return (
      <button
        type="button"
        title={action.label}
        onClick={() => run(action)}
        className="relative flex items-center gap-2 px-3 h-10 md:px-2 md:h-[30px] rounded-[6px] text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-colors"
      >
        <m.Icon className="h-[18px] w-[18px] shrink-0" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => run(action)}
      className="w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] text-gray-700 hover:bg-gray-100/50 transition-colors"
    >
      <span className="relative shrink-0 w-[22px] h-[22px] flex items-center justify-center">
        <m.Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1 truncate text-left">{action.label}</span>
    </button>
  )
}

// ── Renderer слота-ссылки (link) ────────────────────────────────────

function LinkSlotButton({
  slot,
  compact,
  buildHref,
}: {
  slot: SidebarSlot
  compact: boolean
  buildHref: (path: string) => string
}) {
  const label = slot.name?.trim() || 'Ссылка'
  const raw = (slot.url ?? '').trim()
  const isExternal = /^https?:\/\//i.test(raw)
  // Абсолютный http → внешняя вкладка; путь с «/» → как есть; иначе — относительно воркспейса.
  const href = !raw ? '#' : isExternal ? raw : raw.startsWith('/') ? raw : buildHref(raw)
  const m = { Icon: getChatIconComponent(slot.link_icon ?? 'globe') }

  if (compact) {
    return (
      <a
        href={href}
        title={label}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="relative flex items-center gap-2 px-3 h-10 md:px-2 md:h-[30px] rounded-[6px] text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-colors"
      >
        <m.Icon className="h-[18px] w-[18px] shrink-0" />
      </a>
    )
  }
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] text-gray-700 hover:bg-gray-100/50 transition-colors"
    >
      <span className="relative shrink-0 w-[22px] h-[22px] flex items-center justify-center">
        <m.Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
    </a>
  )
}

// ── Renderer папки: кнопка + popover со вложенными ──────────────────

function FolderSlot({
  folder,
  allSlots,
  ...rest
}: { folder: SidebarSlot; allSlots: SidebarSlot[] } & SidebarSlotsRowProps) {
  const [open, setOpen] = useState(false)
  const { compact } = rest
  const children_ = childrenOfFolder(allSlots, folder.id)

  // Бейдж папки — сумма численных бейджей детей (или собственный, если задан).
  const folderBadge = (() => {
    const own = rest.computeBadge(folder.badge_mode)
    if (own) return own
    const childBadges = children_
      .map((c) => rest.computeBadge(c.badge_mode))
      .filter((b): b is string => !!b && /^\d+$/.test(b))
      .map(Number)
    if (childBadges.length === 0) return undefined
    const total = childBadges.reduce((a, b) => a + b, 0)
    return total > 0 ? String(total) : undefined
  })()

  const folderBadgeMeta = getBadgeColorMeta(folder.badge_color)
  const triggerLabel = folder.name ?? 'Папка'
  // Иконка папки: выбранная (folder_icon из THREAD_ICONS) или дефолтная Folder.
  const fm = { Icon: folder.folder_icon ? getChatIconComponent(folder.folder_icon) : FolderIcon }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            title={triggerLabel}
            className={cn(
              'relative flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors',
              open
                ? 'bg-gray-200 text-gray-900'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50',
            )}
          >
            <fm.Icon className="h-[18px] w-[18px] shrink-0" />
            {folderBadge && (
              <span className={cn(
                'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold leading-none flex items-center justify-center',
                folderBadgeMeta.roundClasses,
              )}>
                {folderBadge}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-2 h-[30px] text-[14px] rounded-[6px] transition-colors font-medium',
              open ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:bg-gray-100/50',
            )}
          >
            <span className="relative shrink-0 w-[22px] h-[22px] flex items-center justify-center">
              <fm.Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 truncate text-left">{triggerLabel}</span>
            {folderBadge && (
              <span className={cn(
                'min-w-[18px] h-[18px] px-[3px] rounded-[4px] text-[11px] font-semibold leading-none flex items-center justify-center',
                folderBadgeMeta.pillClasses,
              )}>
                {folderBadge}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={compact ? 'bottom' : 'right'}
        className="w-64 p-1"
        onClick={() => setOpen(false)}
      >
        <div className="text-xs text-gray-500 px-2 py-1">{triggerLabel}</div>
        {children_.length === 0 ? (
          <div className="text-xs text-gray-400 px-2 py-2">Папка пустая</div>
        ) : (
          <div className="flex flex-col gap-[1px]">
            {children_.map((child) => (
              <SingleSlot key={child.id} slot={child} {...rest} compact={false} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
