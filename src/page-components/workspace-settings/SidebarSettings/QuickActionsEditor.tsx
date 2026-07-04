"use client"

/**
 * Редактор быстрых действий («+») активного профиля настроек.
 * Список действий + добавление/правка через диалог. Сохранение — в
 * config.quick_actions активного профиля (useUpdateActiveQuickActions).
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { THREAD_ICONS } from '@/components/messenger/threadConstants'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { useActiveInterfacePreset, useUpdateActiveQuickActions } from '@/hooks/useInterfacePresets'
import { quickActionsEditorKeys } from '@/hooks/queryKeys'
import {
  DEFAULT_QUICK_ACTION_ICON,
  QUICK_ACTION_KIND_LABELS,
  type QuickAction,
  type QuickActionKind,
} from '@/types/quickActions'

const ROUTE_OPTIONS = [
  { value: 'inbox', label: 'Входящие' },
  { value: 'tasks', label: 'Задачи' },
  { value: 'tasks?filter=no_project', label: 'Без проекта' },
  { value: 'calendar', label: 'Календарь' },
  { value: 'boards', label: 'Доски и списки' },
  { value: 'digests', label: 'Дневник' },
]

const CONTACT_ROLES = ['Клиент', 'Внешний контакт', 'Сотрудник', 'Исполнитель', 'Администратор']

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function QuickActionsEditor({ workspaceId }: { workspaceId: string }) {
  const { quickActions } = useActiveInterfacePreset(workspaceId)
  const save = useUpdateActiveQuickActions()
  const [editing, setEditing] = useState<QuickAction | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const persist = (next: QuickAction[]) =>
    save.mutate(
      { workspaceId, quickActions: next },
      {
        onError: (err) =>
          toast.error('Не удалось сохранить', {
            description: getUserFacingErrorMessage(err),
          }),
      },
    )

  const move = (idx: number, delta: -1 | 1) => {
    const next = [...quickActions]
    const j = idx + delta
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    persist(next)
  }

  const remove = (id: string) => persist(quickActions.filter((a) => a.id !== id))

  const upsert = (action: QuickAction) => {
    const exists = quickActions.some((a) => a.id === action.id)
    persist(exists ? quickActions.map((a) => (a.id === action.id ? action : a)) : [...quickActions, action])
    setDialogOpen(false)
    setEditing(null)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-gray-700">Быстрые действия «+»</div>
          <div className="text-[11px] text-gray-400">
            Меню кнопки «Создать» в сайдбаре. Своё для каждого профиля.
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Действие
        </Button>
      </div>

      {quickActions.length === 0 ? (
        <div className="text-xs text-gray-400 px-2 py-3 text-center border border-dashed border-gray-200 rounded-md">
          Действий пока нет. Добавь первое — оно появится в меню «+».
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {quickActions.map((action, idx) => {
            const Icon = getChatIconComponent(action.icon)
            return (
              <div
                key={action.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent hover:bg-gray-50"
              >
                <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="flex-1 min-w-0 text-sm truncate">{action.label}</span>
                <span className="text-[11px] text-gray-400">
                  {QUICK_ACTION_KIND_LABELS[action.kind]}
                </span>
                <div className="flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                    aria-label="Выше"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    disabled={idx === quickActions.length - 1}
                    onClick={() => move(idx, 1)}
                    aria-label="Ниже"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-gray-700"
                    onClick={() => {
                      setEditing(action)
                      setDialogOpen(true)
                    }}
                    aria-label="Изменить"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="p-1 text-gray-400 hover:text-red-500"
                    onClick={() => remove(action.id)}
                    aria-label="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dialogOpen && (
        <QuickActionFormDialog
          key={editing?.id ?? 'new'}
          onClose={() => {
            setDialogOpen(false)
            setEditing(null)
          }}
          workspaceId={workspaceId}
          initial={editing}
          onSubmit={upsert}
        />
      )}
    </div>
  )
}

function QuickActionFormDialog({
  onClose,
  workspaceId,
  initial,
  onSubmit,
}: {
  onClose: () => void
  workspaceId: string
  initial: QuickAction | null
  onSubmit: (action: QuickAction) => void
}) {
  const [label, setLabel] = useState(() => initial?.label ?? '')
  const [kind, setKind] = useState<QuickActionKind>(() => initial?.kind ?? 'new_project')
  const [icon, setIcon] = useState<string>(
    () => initial?.icon ?? DEFAULT_QUICK_ACTION_ICON.new_project,
  )
  // Иконку выбрали вручную — больше не перетираем её автоподстановкой из шаблона.
  const [iconTouched, setIconTouched] = useState(false)
  const [projectTemplateId, setProjectTemplateId] = useState<string>(
    () => initial?.projectTemplateId ?? 'none',
  )
  const [threadTemplateId, setThreadTemplateId] = useState<string>(
    () => initial?.threadTemplateId ?? '',
  )
  const [targetProjectId, setTargetProjectId] = useState<string>(
    () => initial?.targetProjectId ?? 'none',
  )
  const [defaultRole, setDefaultRole] = useState<string>(() => initial?.defaultRole ?? 'Клиент')
  const [route, setRoute] = useState<string>(() => initial?.route ?? 'inbox')

  const { data: projectTemplates = [] } = useQuery({
    queryKey: quickActionsEditorKeys.projectTemplates(workspaceId),
    enabled: true,
    queryFn: async () => {
      const { data } = await supabase
        .from('project_templates')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name')
      return data ?? []
    },
  })

  const { data: threadTemplates = [] } = useQuery({
    queryKey: quickActionsEditorKeys.threadTemplates(workspaceId),
    enabled: true,
    queryFn: async () => {
      // Только глобальная библиотека шаблонов тредов (без пер-проектных
      // дублей) — owner_project_template_id IS NULL.
      const { data } = await supabase
        .from('thread_templates')
        .select('id, name, icon')
        .eq('workspace_id', workspaceId)
        .is('owner_project_template_id', null)
        .order('name')
      return data ?? []
    },
  })

  const { data: projects = [] } = useQuery({
    queryKey: quickActionsEditorKeys.projects(workspaceId),
    enabled: true,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('is_deleted', false)
        .order('last_activity_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
  })

  const submit = () => {
    if (!label.trim()) {
      toast.error('Укажи название действия')
      return
    }
    if (kind === 'new_thread' && !threadTemplateId) {
      toast.error('Выбери шаблон треда')
      return
    }
    const action: QuickAction = {
      id: initial?.id ?? uuid(),
      label: label.trim(),
      icon,
      kind,
      projectTemplateId: kind === 'new_project' && projectTemplateId !== 'none' ? projectTemplateId : null,
      threadTemplateId: kind === 'new_thread' ? threadTemplateId : null,
      targetProjectId: kind === 'new_thread' && targetProjectId !== 'none' ? targetProjectId : null,
      defaultRole: kind === 'new_contact' ? defaultRole : null,
      route: kind === 'open_route' ? route : null,
    }
    onSubmit(action)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Изменить действие' : 'Новое действие'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Название</label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Напр. «Новый лид»"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Тип</label>
            <Select
              value={kind}
              onValueChange={(v) => {
                const k = v as QuickActionKind
                setKind(k)
                if (!iconTouched) setIcon(DEFAULT_QUICK_ACTION_ICON[k])
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(QUICK_ACTION_KIND_LABELS) as QuickActionKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {QUICK_ACTION_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Иконка</label>
            <Select
              value={icon}
              onValueChange={(v) => {
                setIcon(v)
                setIconTouched(true)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THREAD_ICONS.map((i) => {
                  const Ic = i.icon
                  return (
                    <SelectItem key={i.value} value={i.value}>
                      <span className="flex items-center gap-2">
                        <Ic className="w-4 h-4" /> {i.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {kind === 'new_project' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Шаблон проекта</label>
              <Select value={projectTemplateId} onValueChange={setProjectTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Пустой проект</SelectItem>
                  {projectTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'new_thread' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Шаблон треда</label>
                <Select
                  value={threadTemplateId}
                  onValueChange={(v) => {
                    setThreadTemplateId(v)
                    // Иконку действия подставляем из шаблона, если её не меняли вручную.
                    if (!iconTouched) {
                      const tpl = threadTemplates.find((t) => t.id === v)
                      if (tpl?.icon) setIcon(tpl.icon)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выбери шаблон" />
                  </SelectTrigger>
                  <SelectContent>
                    {threadTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Проект</label>
                <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без проекта</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {kind === 'new_contact' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Роль по умолчанию</label>
              <Select value={defaultRole} onValueChange={setDefaultRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'open_route' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Раздел</label>
              <Select value={route} onValueChange={setRoute}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit}>{initial ? 'Сохранить' : 'Добавить'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
