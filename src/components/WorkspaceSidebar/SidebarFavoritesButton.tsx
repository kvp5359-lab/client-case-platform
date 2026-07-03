"use client"

/**
 * Кнопка «Избранное» справа от поиска в сайдбаре. Клик → поповер:
 *  - вверху «Добавить текущую страницу» (тред/проект/доска/список, открытый сейчас);
 *  - ниже список избранного, сгруппированный по типам.
 * Данные персональные (см. useFavorites). Открытие треда — через globalOpenThread,
 * остальное — router.push.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Star,
  Plus,
  X,
  GripVertical,
  Settings2,
  Check,
  FolderOpen,
  Kanban,
  ListChecks,
  CheckSquare,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/lib/supabase'
import { favoriteThreadNamesKeys } from '@/hooks/queryKeys'
import {
  useFavorites,
  useToggleFavorite,
  useReorderFavorites,
  type FavoriteEntityType,
  type FavoriteTarget,
} from '@/hooks/useFavorites'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists } from '@/hooks/useItemLists'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { useLayoutTaskPanel } from '@/components/tasks/TaskPanelContext'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads.types'
import { getProjectIcon } from '@/components/common/project-icons'
import { useProjectIconResolver, useProjectTemplateIcons } from '@/hooks/useGlobalSearch'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

type ResolvedFavorite = {
  /** id строки user_favorites (для переупорядочивания/удаления). */
  favId: string
  type: FavoriteEntityType
  id: string
  name: string
  Icon: LucideIcon
  /** Tailwind text-класс цвета иконки (для тредов — акцент). По умолчанию серый. */
  iconClass?: string
  /** CSS-цвет иконки (для проектов — из template/статуса, как в сайдбаре). */
  iconColorStyle?: string
  /** Префикс имени проекта (как в сайдбаре, приглушённым). */
  namePrefix?: string
}

const TYPE_GROUPS: { type: FavoriteEntityType; label: string }[] = [
  { type: 'thread', label: 'Треды и задачи' },
  { type: 'project', label: 'Проекты' },
  { type: 'board', label: 'Доски' },
  { type: 'list', label: 'Списки' },
]

export function SidebarFavoritesButton({ workspaceId }: { workspaceId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const ctx = useLayoutTaskPanel()
  const activeThreadId = ctx?.activeThreadId ?? null
  const activeProjectId = ctx?.activeProjectId ?? null

  const { data: favorites = [] } = useFavorites(workspaceId)
  const toggle = useToggleFavorite(workspaceId)
  const reorder = useReorderFavorites(workspaceId)

  const { data: projects = [] } = useWorkspaceProjects(workspaceId)
  const { data: boards = [] } = useBoardsQuery(workspaceId)
  const { data: lists = [] } = useItemLists(workspaceId)
  // Иконка + префикс проекта — как в сайдбаре (template.icon + цвет, namePrefix).
  const resolveProjIcon = useProjectIconResolver(workspaceId)
  const { data: templatesById } = useProjectTemplateIcons(workspaceId)

  // Имена избранных тредов резолвим точечным запросом по их id.
  const favThreadIds = useMemo(
    () => favorites.filter((f) => f.entity_type === 'thread').map((f) => f.entity_id).sort(),
    [favorites],
  )
  const { data: threadRows = [] } = useThreadNames(workspaceId, favThreadIds)

  const wsPrefix = workspaceId ? `/workspaces/${workspaceId}` : ''

  const openThread = async (threadId: string) => {
    const { data: thread } = await supabase
      .from('project_threads')
      .select(
        'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
      )
      .eq('id', threadId)
      .eq('is_deleted', false)
      .maybeSingle()
    if (!thread) return
    globalOpenThread({
      id: thread.id,
      name: thread.name,
      type: (thread.type === 'task' ? 'task' : 'chat') as 'chat' | 'task',
      project_id: thread.project_id,
      workspace_id: thread.workspace_id,
      status_id: thread.status_id,
      deadline: thread.deadline,
      accent_color: thread.accent_color,
      icon: thread.icon,
      is_pinned: thread.is_pinned,
      created_at: thread.created_at,
      created_by: thread.created_by,
      sort_order: thread.sort_order ?? 0,
    })
  }

  // ── Резолв названий избранного по типам ──
  const resolved = useMemo(() => {
    const projById = new Map(projects.map((p) => [p.id, p]))
    const boardMap = new Map(boards.map((b) => [b.id, b.name]))
    const listMap = new Map(lists.map((l) => [l.id, l]))
    const threadMap = new Map(threadRows.map((t) => [t.id, t]))
    const byType: Record<FavoriteEntityType, ResolvedFavorite[]> = {
      project: [],
      thread: [],
      board: [],
      list: [],
    }
    for (const f of favorites) {
      if (f.entity_type === 'project') {
        const p = projById.get(f.entity_id)
        const { iconId, iconColor } = resolveProjIcon(p?.template_id ?? null, p?.status_id ?? null)
        const prefix = p?.template_id ? templatesById?.[p.template_id]?.namePrefix : null
        byType.project.push({
          favId: f.id,
          type: 'project',
          id: f.entity_id,
          name: p?.name ?? '— удалён —',
          Icon: p ? getProjectIcon(iconId) : FolderOpen,
          iconColorStyle: p ? iconColor || '#6B7280' : undefined,
          namePrefix: prefix ?? undefined,
        })
      } else if (f.entity_type === 'board') {
        byType.board.push({
          favId: f.id,
          type: 'board',
          id: f.entity_id,
          name: boardMap.get(f.entity_id) ?? '— удалена —',
          Icon: Kanban,
        })
      } else if (f.entity_type === 'list') {
        const l = listMap.get(f.entity_id)
        byType.list.push({
          favId: f.id,
          type: 'list',
          id: f.entity_id,
          name: l?.name ?? '— удалён —',
          Icon: l?.entity_type === 'project' ? FolderOpen : ListChecks,
        })
      } else {
        const t = threadMap.get(f.entity_id)
        byType.thread.push({
          favId: f.id,
          type: 'thread',
          id: f.entity_id,
          name: t?.name ?? '— удалён —',
          Icon: t?.icon ? getChatIconComponent(t.icon) : t?.type === 'task' ? CheckSquare : MessageSquare,
          iconClass: t?.accent_color ? (COLOR_TEXT[t.accent_color as ThreadAccentColor] ?? undefined) : undefined,
        })
      }
    }
    return byType
  }, [favorites, projects, boards, lists, threadRows, resolveProjIcon, templatesById])

  // ── Текущая открытая сущность («Добавить текущее») ──
  const current = useMemo<ResolvedFavorite | null>(() => {
    // Открытый тред в панели — приоритет.
    if (activeThreadId) {
      const t = threadRows.find((x) => x.id === activeThreadId)
      return {
        favId: '',
        type: 'thread',
        id: activeThreadId,
        name: t?.name ?? 'Текущий тред',
        Icon: CheckSquare,
      }
    }
    if (!pathname) return null
    // Список: /boards/list-<uuid>
    const listMatch = pathname.match(/\/boards\/list-([0-9a-fA-F-]+)/)
    if (listMatch && UUID_RE.test(listMatch[1])) {
      const l = lists.find((x) => x.id === listMatch[1])
      return {
        favId: '',
        type: 'list',
        id: listMatch[1],
        name: l?.name ?? 'Текущий список',
        Icon: l?.entity_type === 'project' ? FolderOpen : ListChecks,
      }
    }
    // Доска: /boards/<token> (uuid или short_id) — резолвим в uuid.
    const boardMatch = pathname.match(/\/boards\/([^/]+)/)
    if (boardMatch && boardMatch[1] !== undefined) {
      const token = boardMatch[1]
      const b = boards.find((x) => x.id === token || String(x.short_id) === token)
      if (b) return { favId: '', type: 'board', id: b.id, name: b.name, Icon: Kanban }
    }
    // Проект: ctx.activeProjectId либо токен в /projects/<token> (uuid ИЛИ
    // short_id, напр. /projects/22). Резолвим токен в uuid по списку проектов,
    // чтобы в избранное всегда попадал uuid.
    const projMatch = pathname.match(/\/projects\/([^/]+)/)
    let projId = activeProjectId ?? null
    if (!projId && projMatch && projMatch[1] !== undefined) {
      const token = projMatch[1]
      const p = projects.find((x) => x.id === token || String(x.short_id) === token)
      if (p) projId = p.id
    }
    if (projId) {
      const name = projects.find((p) => p.id === projId)?.name ?? 'Текущий проект'
      return { favId: '', type: 'project', id: projId, name, Icon: FolderOpen }
    }
    return null
  }, [activeThreadId, activeProjectId, pathname, boards, lists, projects, threadRows])

  const isFavorited = (type: FavoriteEntityType, id: string) =>
    favorites.some((f) => f.entity_type === type && f.entity_id === id)

  const handleOpen = (item: ResolvedFavorite) => {
    setOpen(false)
    if (item.type === 'thread') {
      void openThread(item.id)
    } else if (item.type === 'project') {
      router.push(`${wsPrefix}/projects/${item.id}`)
    } else if (item.type === 'board') {
      router.push(`${wsPrefix}/boards/${item.id}`)
    } else {
      router.push(`${wsPrefix}/boards/list-${item.id}`)
    }
  }

  const toggleFav = (target: FavoriteTarget) => toggle.mutate(target)

  const hasAny = favorites.length > 0
  const currentFavored = current ? isFavorited(current.type, current.id) : false

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setReorderMode(false)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Избранное"
          aria-label="Избранное"
          className="shrink-0 flex items-center justify-center h-6 w-6 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Star className="h-[15px] w-[15px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-72 p-1.5">
        {hasAny && (
          <div className="flex items-center justify-between px-2 py-0.5 mb-0.5">
            <span className="text-[11px] font-medium text-gray-400">Избранное</span>
            <button
              type="button"
              onClick={() => setReorderMode((v) => !v)}
              title={reorderMode ? 'Готово' : 'Изменить порядок'}
              aria-label={reorderMode ? 'Готово' : 'Изменить порядок'}
              className={`p-1 rounded transition-colors ${
                reorderMode
                  ? 'text-primary bg-primary/10'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              {reorderMode ? <Check className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        {!hasAny && (
          <div className="px-2 py-4 text-xs text-gray-400 text-center">
            Пока пусто. Открой тред, проект, доску или список и нажми «Добавить текущую страницу».
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          {TYPE_GROUPS.map((g) => {
            const items = resolved[g.type]
            if (items.length === 0) return null
            return (
              <FavoritesGroup
                key={g.type}
                label={g.label}
                items={items}
                reorderMode={reorderMode}
                onOpen={handleOpen}
                onRemove={(item) => toggleFav({ type: item.type, id: item.id })}
                onReorder={(orderedFavIds) => reorder.mutate(orderedFavIds)}
              />
            )
          })}
        </div>

        {/* Кнопка добавления — внизу, под всеми позициями. */}
        {current && (
          <>
            {hasAny && <div className="border-t border-gray-100 my-1" />}
            <button
              type="button"
              onClick={() => toggleFav({ type: current.type, id: current.id })}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-gray-100 transition-colors"
            >
              {currentFavored ? (
                <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
              ) : (
                <Plus className="h-4 w-4 shrink-0 text-gray-500" />
              )}
              <span className="flex-1 min-w-0 truncate text-left">
                {currentFavored ? 'Убрать из избранного' : 'Добавить текущую страницу'}
              </span>
              <span className="text-[11px] text-gray-400 truncate max-w-[90px]">{current.name}</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Группа избранного с DnD-переупорядочиванием внутри неё ──

function FavoritesGroup({
  label,
  items,
  reorderMode,
  onOpen,
  onRemove,
  onReorder,
}: {
  label: string
  items: ResolvedFavorite[]
  reorderMode: boolean
  onOpen: (item: ResolvedFavorite) => void
  onRemove: (item: ResolvedFavorite) => void
  onReorder: (orderedFavIds: string[]) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = items.map((i) => i.favId)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onReorder(arrayMove(ids, from, to))
  }

  const header = <div className="text-[11px] font-medium text-gray-400 px-2 pt-1 pb-0.5">{label}</div>

  // Обычный режим — без DnD-обвязки (грипов нет, строки кликабельны).
  if (!reorderMode) {
    return (
      <div className="mb-1">
        {header}
        {items.map((item) => (
          <FavItemRow
            key={item.favId}
            item={item}
            onOpen={() => onOpen(item)}
            onRemove={() => onRemove(item)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="mb-1">
      {header}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.favId)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableFavItem key={item.favId} item={item} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

/** Обычная строка избранного (клик открывает, ×-удаление по ховеру). */
function FavItemRow({
  item,
  onOpen,
  onRemove,
}: {
  item: ResolvedFavorite
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
    >
      <item.Icon
        className={`h-4 w-4 shrink-0 ${item.iconClass ?? (item.iconColorStyle ? '' : 'text-gray-500')}`}
        style={item.iconColorStyle ? { color: item.iconColorStyle } : undefined}
      />
      <span className="flex-1 min-w-0 truncate text-sm">
        {item.namePrefix ? <span className="text-muted-foreground/70">{item.namePrefix} </span> : null}
        {item.name}
      </span>
      <button
        type="button"
        aria-label="Убрать из избранного"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:text-red-500 transition-opacity shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Строка в режиме переупорядочивания: грип + drag, клик/удаление отключены. */
function SortableFavItem({ item }: { item: ResolvedFavorite }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.favId,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-gray-50 mb-0.5 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
        className="cursor-grab text-gray-400 hover:text-gray-600 shrink-0"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <item.Icon
        className={`h-4 w-4 shrink-0 ${item.iconClass ?? (item.iconColorStyle ? '' : 'text-gray-500')}`}
        style={item.iconColorStyle ? { color: item.iconColorStyle } : undefined}
      />
      <span className="flex-1 min-w-0 truncate text-sm">
        {item.namePrefix ? <span className="text-muted-foreground/70">{item.namePrefix} </span> : null}
        {item.name}
      </span>
    </div>
  )
}

// ── Имена избранных тредов (точечный запрос по id) ──

type FavThreadRow = {
  id: string
  name: string
  type: string | null
  icon: string | null
  accent_color: string | null
}

function useThreadNames(workspaceId: string | undefined, threadIds: string[]) {
  return useQuery({
    queryKey: favoriteThreadNamesKeys.byWorkspaceThreads(workspaceId ?? '', threadIds),
    enabled: !!workspaceId && threadIds.length > 0,
    queryFn: async (): Promise<FavThreadRow[]> => {
      const { data, error } = await supabase
        .from('project_threads')
        .select('id, name, type, icon, accent_color')
        .in('id', threadIds)
      if (error) throw error
      return (data ?? []) as FavThreadRow[]
    },
  })
}
