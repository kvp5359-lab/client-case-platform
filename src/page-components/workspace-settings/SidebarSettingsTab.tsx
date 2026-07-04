"use client"

/**
 * SidebarSettingsTab — раздел «Сайдбар» в настройках воркспейса.
 *
 * WYSIWYG-редактор активного «Профиля настроек»: слева макет сайдбара (зона
 * иконок + список с папками), справа палитра «Доступные» + инспектор пункта.
 * Размещение — перетаскиванием (`SidebarEditorCanvas`). Сверху — управление
 * профилями (`ProfilesManagerBar`). Доступ: только владелец воркспейса.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useUpdateProjectDisplayPrefs } from '@/hooks/useInterfacePresets'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists, type ItemList } from '@/hooks/useItemLists'
import { useSections, useCreateSection } from '@/hooks/useSections'
import {
  useUpdateWorkspaceSidebarSettings,
  useWorkspaceSidebarSettings,
} from '@/hooks/useWorkspaceSidebarSettings'
import {
  boardIdFromSlotId,
  DEFAULT_SIDEBAR_SLOTS,
  listIdFromSlotId,
  sectionIdFromSlotId,
  reorderWithinZones,
  slotRef,
  type SidebarSlot,
} from '@/lib/sidebarSettings'
import { SidebarEditorCanvas } from './SidebarSettings/SidebarEditorCanvas'
import { ProfilesManagerBar } from './SidebarSettings/ProfilesManagerBar'
import { QuickActionsEditor } from './SidebarSettings/QuickActionsEditor'

export function SidebarSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const isOwner = permissions.isOwner

  const { data: settings, isLoading } = useWorkspaceSidebarSettings(workspaceId)
  const { data: boards = [] } = useBoardsQuery(workspaceId)
  const { data: itemLists = [] } = useItemLists(workspaceId)
  const { data: sections = [] } = useSections(workspaceId)
  const createSection = useCreateSection()
  const update = useUpdateWorkspaceSidebarSettings()

  const [override, setOverride] = useState<SidebarSlot[] | null>(null)
  const slots = override ?? settings?.slots ?? DEFAULT_SIDEBAR_SLOTS

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600">
          Доступ к настройкам сайдбара только у владельца воркспейса.
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем настройки…
        </CardContent>
      </Card>
    )
  }

  const handleSave = async () => {
    if (!workspaceId) return
    try {
      await update.mutateAsync({ workspaceId, slots })
      setOverride(null)
      toast.success('Настройки сайдбара сохранены')
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: getUserFacingErrorMessage(err),
      })
    }
  }

  const handleResetDefaults = () => setOverride([...DEFAULT_SIDEBAR_SLOTS])

  const dirty = override !== null

  return (
    <SidebarSettingsView
      workspaceId={workspaceId}
      slots={slots}
      showProjectIcons={settings?.showProjectIcons ?? true}
      showProjectPrefixes={settings?.showProjectPrefixes ?? true}
      boards={boards.map((b) => ({ id: b.id, name: b.name }))}
      itemLists={itemLists}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      onCreateSection={(name) => {
        if (workspaceId) createSection.mutate({ workspace_id: workspaceId, name })
      }}
      onChange={setOverride}
      onSave={handleSave}
      onReset={handleResetDefaults}
      dirty={dirty}
      saving={update.isPending}
      leftColumn={
        workspaceId ? (
          <ProfilesManagerBar
            workspaceId={workspaceId}
            vertical
            onBeforeSwitch={() => setOverride(null)}
          />
        ) : null
      }
      rightExtra={workspaceId ? <QuickActionsEditor workspaceId={workspaceId} /> : null}
    />
  )
}

function SidebarSettingsView({
  workspaceId,
  slots,
  showProjectIcons,
  showProjectPrefixes,
  boards,
  itemLists,
  sections,
  onCreateSection,
  onChange,
  onSave,
  onReset,
  dirty,
  saving,
  leftColumn,
  rightExtra,
}: {
  workspaceId: string
  slots: SidebarSlot[]
  showProjectIcons: boolean
  showProjectPrefixes: boolean
  boards: { id: string; name: string }[]
  itemLists: ItemList[]
  sections: { id: string; name: string }[]
  onCreateSection: (name: string) => void
  onChange: (next: SidebarSlot[]) => void
  onSave: () => void
  onReset: () => void
  dirty: boolean
  saving: boolean
  leftColumn: ReactNode
  rightExtra: ReactNode
}) {
  // Очистка слотов от мёртвых элементов (удалённых из воркспейса досок/списков/
  // разделов). nav/folder — всегда живые.
  const liveSlots = useMemo(() => {
    const boardIds = new Set(boards.map((b) => b.id))
    const listIds = new Set(itemLists.map((l) => l.id))
    const sectionIds = new Set(sections.map((s) => s.id))
    return slots.filter((s) => {
      if (s.type === 'nav' || s.type === 'folder' || s.type === 'quickaction' || s.type === 'link')
        return true
      if (s.type === 'board') {
        const bid = boardIdFromSlotId(slotRef(s))
        return bid ? boardIds.has(bid) : false
      }
      if (s.type === 'list') {
        const lid = listIdFromSlotId(slotRef(s))
        return lid ? listIds.has(lid) : false
      }
      // type === 'section'
      const sid = sectionIdFromSlotId(slotRef(s))
      return sid ? sectionIds.has(sid) : false
    })
  }, [slots, boards, itemLists, sections])
  const hasDeadSlots = liveSlots.length !== slots.length
  const cleanDeadSlots = () => onChange(reorderWithinZones(liveSlots))

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-4">
      <ProjectDisplayToggles
        workspaceId={workspaceId}
        showProjectIcons={showProjectIcons}
        showProjectPrefixes={showProjectPrefixes}
      />

      {hasDeadSlots && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            В сайдбаре есть {slots.length - liveSlots.length} «мёртвых» элемента —
            доски, которых больше нет в воркспейсе.
          </div>
          <Button size="sm" variant="outline" onClick={cleanDeadSlots}>
            Очистить
          </Button>
        </div>
      )}

      {/* 3 колонки: 20% профили+действия · 40% зоны · 40% палитра+инспектор. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_2fr] gap-4 items-start">
        <div className="space-y-3">{leftColumn}</div>
        <div className="lg:col-span-2">
          <SidebarEditorCanvas
            slots={slots}
            boards={boards}
            itemLists={itemLists}
            sections={sections}
            workspaceId={workspaceId}
            onChange={onChange}
            onCreateSection={onCreateSection}
            rightExtra={rightExtra}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-200">
        <Button onClick={onSave} disabled={saving || !dirty}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Сохранить
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Сбросить к стандартным
        </Button>
      </div>
    </div>
  )
}

/**
 * Тумблеры «Иконки проектов» / «Префиксы проектов» — вид списка проектов в
 * сайдбаре. Сохраняются сразу (в активный «Профиль настроек»), независимо от
 * кнопки «Сохранить» редактора слотов.
 */
function ProjectDisplayToggles({
  workspaceId,
  showProjectIcons,
  showProjectPrefixes,
}: {
  workspaceId: string
  showProjectIcons: boolean
  showProjectPrefixes: boolean
}) {
  const update = useUpdateProjectDisplayPrefs()

  const setIcons = (value: boolean) => {
    update.mutate(
      { workspaceId, showProjectIcons: value },
      {
        onError: (err) =>
          toast.error('Не удалось сохранить', {
            description: getUserFacingErrorMessage(err),
          }),
      },
    )
  }
  const setPrefixes = (value: boolean) => {
    update.mutate(
      { workspaceId, showProjectPrefixes: value },
      {
        onError: (err) =>
          toast.error('Не удалось сохранить', {
            description: getUserFacingErrorMessage(err),
          }),
      },
    )
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <p className="text-sm font-medium text-gray-800">Список проектов</p>
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm text-gray-700">
            Иконки проектов
            <span className="block text-xs text-gray-500">
              Показывать значок слева от названия проекта.
            </span>
          </span>
          <Switch checked={showProjectIcons} onCheckedChange={setIcons} />
        </label>
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm text-gray-700">
            Префиксы проектов
            <span className="block text-xs text-gray-500">
              Показывать приставку из шаблона (напр. «Лид Ю:», «CRM») перед названием.
            </span>
          </span>
          <Switch checked={showProjectPrefixes} onCheckedChange={setPrefixes} />
        </label>
      </CardContent>
    </Card>
  )
}
