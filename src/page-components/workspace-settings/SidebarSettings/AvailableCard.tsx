"use client"

import { useMemo, useState } from 'react'
import { FolderTree, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SIDEBAR_NAV_ITEMS, type SidebarPlacement } from '@/lib/sidebarSettings'
import { plural } from './plural'
import type { AvailableEntry } from './types'

type AvailableCardProps = {
  availableNav: AvailableEntry[]
  availableSections: { id: string; name: string }[]
  onAdd: (entry: AvailableEntry, placement: SidebarPlacement) => void
  /** Создать новый раздел (по названию). */
  onCreateSection: (name: string) => void
}

export function AvailableCard({
  availableNav,
  availableSections,
  onAdd,
  onCreateSection,
}: AvailableCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступные</CardTitle>
        <CardDescription>
          Элементы, которые сейчас не в сайдбаре. Нажми «в верх» или «в список», чтобы добавить.
          «Раздел» — групповой пункт: создай новый или добавь существующий в сайдбар.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-gray-100 rounded-md border border-dashed border-gray-300 bg-gray-50/40">
          {availableNav.map((entry) => {
            if (entry.kind !== 'nav') return null
            const Icon = SIDEBAR_NAV_ITEMS[entry.navKey].icon
            return (
              <AvailableRowSimple
                key={entry.id}
                icon={<Icon className="w-4 h-4 shrink-0 text-gray-400" />}
                label={entry.label}
                onAdd={(placement) => onAdd(entry, placement)}
              />
            )
          })}

          {/* «Раздел» — всегда виден: можно создать новый и/или добавить существующий. */}
          <SectionAvailableRow
            availableSections={availableSections}
            onCreate={onCreateSection}
            onAddExisting={(sectionId, placement) => {
              const target = availableSections.find((s) => s.id === sectionId)
              if (!target) return
              onAdd(
                { kind: 'section', id: `section:${sectionId}`, label: target.name, sectionId },
                placement,
              )
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Строка «Раздел» в «Доступных»: создание нового раздела (инлайн-инпут) +
 * добавление уже существующих разделов в зону через поповеры.
 */
function SectionAvailableRow({
  availableSections,
  onCreate,
  onAddExisting,
}: {
  availableSections: { id: string; name: string }[]
  onCreate: (name: string) => void
  onAddExisting: (sectionId: string, placement: SidebarPlacement) => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const commit = () => {
    const n = name.trim()
    if (n) onCreate(n)
    setName('')
    setCreating(false)
  }

  const items = availableSections.map((s) => ({
    id: s.id,
    label: s.name,
    icon: <FolderTree className="w-3.5 h-3.5 text-gray-400" />,
  }))

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <FolderTree className="w-4 h-4 shrink-0 text-gray-400" />
      <div className="flex-1 min-w-0">
        {creating ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setCreating(false); setName('') }
            }}
            placeholder="Название раздела"
            className="h-8 text-sm"
          />
        ) : (
          <>
            <div className="text-sm text-gray-700 truncate">Раздел</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {availableSections.length > 0
                ? `${availableSections.length} ${plural(availableSections.length, 'раздел', 'раздела', 'разделов')} доступны`
                : 'Создай новый раздел'}
            </div>
          </>
        )}
      </div>
      {!creating && (
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          создать
        </Button>
      )}
      {availableSections.length > 0 && (
        <>
          <GroupPickerButton triggerLabel="в верх" items={items} onPick={(id) => onAddExisting(id, 'topbar')} />
          <GroupPickerButton triggerLabel="в список" items={items} onPick={(id) => onAddExisting(id, 'list')} />
        </>
      )}
    </div>
  )
}

function AvailableRowSimple({
  icon,
  label,
  onAdd,
}: {
  icon: React.ReactNode
  label: string
  onAdd: (placement: SidebarPlacement) => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {icon}
      <div className="flex-1 min-w-0 text-sm text-gray-700 truncate">{label}</div>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onAdd('topbar')}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        в верх
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onAdd('list')}>
        <Plus className="w-3.5 h-3.5 mr-1" />
        в список
      </Button>
    </div>
  )
}

function GroupPickerButton({
  triggerLabel,
  items,
  onPick,
}: {
  triggerLabel: string
  items: { id: string; label: string; icon?: React.ReactNode }[]
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.label.toLowerCase().includes(q))
  }, [items, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-0">
        {items.length > 5 && (
          <div className="p-2 border-b">
            <Input
              placeholder="Поиск…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="h-8 text-sm"
            />
          </div>
        )}
        <div className="max-h-[260px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Ничего не найдено
            </div>
          ) : (
            filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onPick(it.id)
                  setOpen(false)
                  setSearch('')
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 text-sm"
              >
                {it.icon}
                <span className="truncate">{it.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
