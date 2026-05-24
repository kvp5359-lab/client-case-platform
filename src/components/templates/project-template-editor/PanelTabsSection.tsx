"use client"

/**
 * PanelTabsSection — какие вкладки боковой панели будут закреплены по
 * умолчанию при создании проекта данного шаблона, и в каком порядке.
 *
 * Хранится в `project_templates.default_panel_tabs` (jsonb):
 *   - NULL → старое поведение (хардкод: Задачи + История)
 *   - []   → не закреплять ничего
 *   - [...] → закрепить эти вкладки в указанном порядке
 *
 * Применяется только к НОВЫМ проектам. У пользователей с уже существующей
 * записью в `task_panel_tabs` ничего не меняется.
 *
 * UI: две зоны — «Закреплено» (drag для порядка, × для удаления) и «Доступно»
 * (клик добавляет в конец закреплённых).
 */

import { useMemo } from 'react'
import {
  CheckSquare,
  FolderOpen,
  History,
  FileText,
  BookOpen,
  Bot,
  Lock,
  GripVertical,
  X,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { THREAD_ICONS } from '@/components/messenger/threadConstants'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { useProjectTemplateMutations } from './useProjectTemplateMutations'
import {
  isDefaultPanelTabsArray,
  SYSTEM_PANEL_TAB_LABELS,
  type DefaultPanelTabItem,
  type SystemPanelTabKey,
} from './panelTabsTypes'

type Props = {
  workspaceId: string
  projectTemplateId: string
  enabledModules: string[]
  defaultPanelTabs: unknown
}

type SystemTabDef = {
  key: SystemPanelTabKey
  icon: LucideIcon
  /** Ключ модуля в enabled_modules. null = не зависит от шаблона. */
  requiresModule: string | null
}

const SYSTEM_TABS: SystemTabDef[] = [
  { key: 'tasks', icon: CheckSquare, requiresModule: 'tasks' },
  { key: 'documents', icon: FolderOpen, requiresModule: null },
  { key: 'forms', icon: FileText, requiresModule: 'forms' },
  { key: 'materials', icon: BookOpen, requiresModule: 'knowledge_base' },
  { key: 'history', icon: History, requiresModule: null },
  { key: 'project_context', icon: Lock, requiresModule: 'project_context' },
  { key: 'assistant', icon: Bot, requiresModule: null },
]

/** Стабильный DnD id для элемента. */
function itemDndId(item: DefaultPanelTabItem): string {
  return item.type === 'system' ? `system:${item.key}` : `thread:${item.id}`
}

export function PanelTabsSection({
  workspaceId: _workspaceId,
  projectTemplateId,
  enabledModules,
  defaultPanelTabs,
}: Props) {
  const { data: threadTemplates = [] } = useThreadTemplatesByProjectTemplate(projectTemplateId)

  const { updateDefaultPanelTabsMutation } = useProjectTemplateMutations({
    templateId: projectTemplateId,
    linkedForms: [],
    linkedDocKits: [],
    linkedKnowledgeArticles: [],
    linkedKnowledgeGroups: [],
  })

  const items: DefaultPanelTabItem[] = useMemo(() => {
    if (!isDefaultPanelTabsArray(defaultPanelTabs)) return []
    return defaultPanelTabs
  }, [defaultPanelTabs])

  // Видимые системные вкладки — по enabled_modules.
  const visibleSystemTabs = useMemo(
    () =>
      SYSTEM_TABS.filter(
        (t) => t.requiresModule == null || enabledModules.includes(t.requiresModule),
      ),
    [enabledModules],
  )

  const systemByKey = useMemo(
    () => new Map(visibleSystemTabs.map((s) => [s.key, s])),
    [visibleSystemTabs],
  )
  const threadById = useMemo(
    () => new Map(threadTemplates.map((t) => [t.id, t])),
    [threadTemplates],
  )

  // Доступные (не закреплённые) — отдельно системные и треды, чтобы рендер
  // оставался по двум типам.
  const pinnedSystemKeys = new Set(
    items.filter((i) => i.type === 'system').map((i) => i.key as string),
  )
  const pinnedThreadIds = new Set(
    items.filter((i) => i.type === 'thread_template').map((i) => i.id as string),
  )
  const availableSystems = visibleSystemTabs.filter((s) => !pinnedSystemKeys.has(s.key))
  const availableThreads = threadTemplates.filter((t) => !pinnedThreadIds.has(t.id))

  // Очищаем мёртвые ссылки (модуль выключен / тред-шаблон удалён) — не
  // сохраняем автоматически (чтобы не плодить лишних мутаций), просто не
  // рендерим. Сохранится при следующем изменении пользователем.
  const visibleItems = items.filter((i) =>
    i.type === 'system' ? systemByKey.has(i.key) : threadById.has(i.id),
  )

  const persist = (next: DefaultPanelTabItem[]) => {
    updateDefaultPanelTabsMutation.mutate(next)
  }

  const removeItem = (dndId: string) => {
    persist(visibleItems.filter((i) => itemDndId(i) !== dndId))
  }

  const addSystem = (key: SystemPanelTabKey) => {
    persist([...visibleItems, { type: 'system', key }])
  }

  const addThread = (id: string) => {
    persist([...visibleItems, { type: 'thread_template', id }])
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = visibleItems.map(itemDndId)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    persist(arrayMove(visibleItems, oldIndex, newIndex))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Боковая панель</CardTitle>
        <CardDescription>
          Перетаскивайте элементы в зоне «Закреплено», чтобы изменить порядок. Изменения
          применятся только к проектам, создаваемым с этого момента.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Закреплено */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Закреплено</h4>
          {visibleItems.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">
              Ничего не закреплено. Выберите вкладки из списка ниже.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={visibleItems.map(itemDndId)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <PinnedRow
                      key={itemDndId(item)}
                      item={item}
                      systemByKey={systemByKey}
                      threadById={threadById}
                      onRemove={removeItem}
                      disabled={updateDefaultPanelTabsMutation.isPending}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Доступно */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Доступно</h4>
          {availableSystems.length === 0 && availableThreads.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">
              Все доступные вкладки уже закреплены.
            </p>
          ) : (
            <div className="space-y-1">
              {availableSystems.map((s) => {
                const Icon = s.icon
                return (
                  <AvailableRow
                    key={`sys:${s.key}`}
                    icon={<Icon className="size-4 text-muted-foreground shrink-0" />}
                    label={SYSTEM_PANEL_TAB_LABELS[s.key]}
                    onAdd={() => addSystem(s.key)}
                    disabled={updateDefaultPanelTabsMutation.isPending}
                  />
                )
              })}
              {availableThreads.map((tt) => (
                <AvailableRow
                  key={`tt:${tt.id}`}
                  icon={renderThreadIcon(tt.icon)}
                  label={tt.thread_name_template || 'Без названия'}
                  badge={threadTypeBadge(tt)}
                  onAdd={() => addThread(tt.id)}
                  disabled={updateDefaultPanelTabsMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PinnedRow({
  item,
  systemByKey,
  threadById,
  onRemove,
  disabled,
}: {
  item: DefaultPanelTabItem
  systemByKey: Map<SystemPanelTabKey, SystemTabDef>
  threadById: Map<string, ThreadTemplate>
  onRemove: (dndId: string) => void
  disabled: boolean
}) {
  const id = itemDndId(item)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  let icon: React.ReactNode = null
  let label = ''
  let badge: string | null = null

  if (item.type === 'system') {
    const def = systemByKey.get(item.key)
    if (!def) return null
    const Icon = def.icon
    icon = <Icon className="size-4 text-muted-foreground shrink-0" />
    label = SYSTEM_PANEL_TAB_LABELS[item.key]
  } else {
    const tt = threadById.get(item.id)
    if (!tt) return null
    icon = renderThreadIcon(tt.icon)
    label = tt.thread_name_template || 'Без названия'
    badge = threadTypeBadge(tt)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-md px-2 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 text-muted-foreground"
        aria-label="Переупорядочить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {icon}
      <span className="text-sm">{label}</span>
      {badge && (
        <span className="ml-auto text-xs text-muted-foreground">{badge}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={badge ? 'h-7 w-7' : 'h-7 w-7 ml-auto'}
        onClick={() => onRemove(id)}
        disabled={disabled}
        title="Открепить"
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

function AvailableRow({
  icon,
  label,
  badge,
  onAdd,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  badge?: string | null
  onAdd: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40 disabled:opacity-50 text-left"
    >
      <Plus className="size-4 text-muted-foreground shrink-0" />
      {icon}
      <span className="text-sm">{label}</span>
      {badge && (
        <span className="ml-auto text-xs text-muted-foreground font-normal">{badge}</span>
      )}
    </button>
  )
}

function renderThreadIcon(iconName: string): React.ReactNode {
  const ThreadIcon = THREAD_ICONS.find((i) => i.value === iconName)?.icon
  return ThreadIcon ? (
    <ThreadIcon className="size-4 text-muted-foreground shrink-0" />
  ) : (
    <span className="size-4 shrink-0" />
  )
}

function threadTypeBadge(tt: ThreadTemplate): string {
  if (tt.thread_type === 'task') return 'задача'
  if (tt.is_email) return 'email'
  return 'чат'
}
