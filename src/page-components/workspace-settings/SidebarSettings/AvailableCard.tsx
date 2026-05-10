"use client"

import { useMemo, useState } from 'react'
import { FolderOpen, Kanban, ListChecks, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ItemList } from '@/hooks/useItemLists'
import { SIDEBAR_NAV_ITEMS, type SidebarPlacement } from '@/lib/sidebarSettings'
import { plural } from './plural'
import type { AvailableEntry } from './types'

interface AvailableCardProps {
  availableNav: AvailableEntry[]
  availableBoards: { id: string; name: string }[]
  availableLists: ItemList[]
  onAdd: (entry: AvailableEntry, placement: SidebarPlacement) => void
}

export function AvailableCard({
  availableNav,
  availableBoards,
  availableLists,
  onAdd,
}: AvailableCardProps) {
  const total =
    availableNav.length +
    (availableBoards.length > 0 ? 1 : 0) +
    (availableLists.length > 0 ? 1 : 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Доступные</CardTitle>
        <CardDescription>
          Элементы, которые сейчас не в сайдбаре. Нажми «в верх» или «в список», чтобы добавить.
          «Доска» и «Список» — групповые пункты: при клике откроется список конкретных, для добавления одного из них.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-sm text-gray-500 rounded-md border border-dashed border-gray-300 px-3 py-4 text-center">
            Все элементы уже размещены.
          </div>
        ) : (
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

            {availableBoards.length > 0 && (
              <AvailableGroupRow
                icon={<Kanban className="w-4 h-4 shrink-0 text-gray-400" />}
                label="Доска"
                hint={`${availableBoards.length} ${plural(availableBoards.length, 'доска', 'доски', 'досок')} доступны`}
                onAdd={(boardId, placement) =>
                  onAdd(
                    {
                      kind: 'board',
                      id: `board:${boardId}`,
                      label: availableBoards.find((b) => b.id === boardId)?.name ?? '',
                      boardId,
                    },
                    placement,
                  )
                }
                items={availableBoards.map((b) => ({
                  id: b.id,
                  label: b.name,
                  icon: <Kanban className="w-3.5 h-3.5 text-gray-400" />,
                }))}
              />
            )}

            {availableLists.length > 0 && (
              <AvailableGroupRow
                icon={<ListChecks className="w-4 h-4 shrink-0 text-gray-400" />}
                label="Список"
                hint={`${availableLists.length} ${plural(availableLists.length, 'список', 'списка', 'списков')} доступны`}
                onAdd={(listId, placement) => {
                  const target = availableLists.find((l) => l.id === listId)
                  if (!target) return
                  onAdd(
                    {
                      kind: 'list',
                      id: `list:${listId}`,
                      label: target.name,
                      listId,
                      entityType: target.entity_type,
                    },
                    placement,
                  )
                }}
                items={availableLists.map((l) => ({
                  id: l.id,
                  label: l.name,
                  icon:
                    l.entity_type === 'project' ? (
                      <FolderOpen className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                    ),
                }))}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
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

/**
 * Групповой пункт в «Доступных»: один пункт «Доска» / «Список», при клике на
 * «в верх»/«в список» открывается поповер с конкретными элементами. Пользователь
 * выбирает конкретный элемент → он добавляется в выбранную зону.
 */
function AvailableGroupRow({
  icon,
  label,
  hint,
  items,
  onAdd,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  items: { id: string; label: string; icon?: React.ReactNode }[]
  onAdd: (id: string, placement: SidebarPlacement) => void
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700 truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
      </div>
      <GroupPickerButton triggerLabel="в верх" items={items} onPick={(id) => onAdd(id, 'topbar')} />
      <GroupPickerButton triggerLabel="в список" items={items} onPick={(id) => onAdd(id, 'list')} />
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
