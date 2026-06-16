"use client"

/**
 * Блок «Разделы» в сайдбаре. Каждый раздел раскрывается, внутри — его доски и
 * списки. Клик по разделу → /boards?section=<id> (таб-бар сужается до членов).
 * Создание/переименование/удаление — владельцу/менеджеру.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, FolderTree, Plus, Kanban, ListChecks, FolderOpen, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useBoardsQuery } from '@/components/boards/hooks/useBoardsQuery'
import { useItemLists } from '@/hooks/useItemLists'
import {
  useSections,
  useSectionMaps,
  useCreateSection,
  useUpdateSection,
  useSoftDeleteSection,
} from '@/hooks/useSections'

type Props = {
  workspaceId: string
  canManage: boolean
  buildHref: (path: string) => string
}

export function SidebarSections({ workspaceId, canManage, buildHref }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeSectionId = searchParams.get('section')
  const { data: sections = [] } = useSections(workspaceId)
  const { bySection } = useSectionMaps(workspaceId)
  const { data: boards = [] } = useBoardsQuery(workspaceId)
  const { data: lists = [] } = useItemLists(workspaceId)
  const createSection = useCreateSection()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  if (sections.length === 0 && !canManage) return null

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleCreate = () => {
    const n = newName.trim()
    if (!n) { setCreating(false); return }
    createSection.mutate(
      { workspace_id: workspaceId, name: n },
      { onSuccess: () => { setNewName(''); setCreating(false) } },
    )
  }

  return (
    <div className="mt-2 px-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          <FolderTree className="h-3 w-3" /> Разделы
        </span>
        {canManage && (
          <button
            type="button"
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
            title="Новый раздел"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {creating && (
        <div className="px-2 py-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            placeholder="Название раздела"
            className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {sections.map((s) => {
        const members = bySection.get(s.id) ?? []
        const isOpen = expanded.has(s.id)
        const isActive = activeSectionId === s.id
        return (
          <div key={s.id}>
            <div
              className={cn(
                'group/sec flex items-center gap-1 rounded-md px-1.5 py-1 text-sm cursor-pointer',
                isActive ? 'bg-amber-50 text-amber-700 font-medium' : 'text-foreground/80 hover:bg-muted/60',
              )}
            >
              <button
                type="button"
                className="p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => toggleExpand(s.id)}
                title={isOpen ? 'Свернуть' : 'Развернуть'}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
              </button>
              <span
                className="flex-1 truncate"
                onClick={() => router.push(`${buildHref('boards')}?section=${s.id}`)}
              >
                {s.name}
              </span>
              <span className="text-[11px] text-muted-foreground/60">{members.length}</span>
              {canManage && (
                <SectionMenu workspaceId={workspaceId} sectionId={s.id} currentName={s.name} />
              )}
            </div>

            {isOpen && (
              <div className="ml-5 border-l pl-2 py-0.5">
                {members.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground/60">Пусто</div>
                )}
                {members.map((m) => {
                  if (m.item_type === 'board') {
                    const b = boards.find((x) => x.id === m.item_id)
                    if (!b) return null
                    return (
                      <a
                        key={`board:${m.item_id}`}
                        href={`${buildHref(`boards/${b.id}`)}?section=${s.id}`}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-foreground/75 hover:bg-muted/60 truncate"
                      >
                        <Kanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{b.name}</span>
                      </a>
                    )
                  }
                  const l = lists.find((x) => x.id === m.item_id)
                  if (!l) return null
                  const Icon = l.entity_type === 'project' ? FolderOpen : ListChecks
                  return (
                    <a
                      key={`list:${m.item_id}`}
                      href={`${buildHref(`boards/list-${l.id}`)}?section=${s.id}`}
                      className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-foreground/75 hover:bg-muted/60 truncate"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{l.name}</span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionMenu({ workspaceId, sectionId, currentName }: { workspaceId: string; sectionId: string; currentName: string }) {
  const update = useUpdateSection()
  const softDelete = useSoftDeleteSection()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(currentName)

  if (renaming) {
    return (
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => { setRenaming(false); if (name.trim() && name !== currentName) update.mutate({ id: sectionId, workspace_id: workspaceId, name }) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          if (e.key === 'Escape') { setName(currentName); setRenaming(false) }
        }}
        className="w-24 text-xs border rounded px-1 py-0.5 focus:outline-none"
      />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-0.5 rounded text-muted-foreground opacity-0 group-hover/sec:opacity-100 hover:text-foreground hover:bg-black/10"
          onClick={(e) => e.stopPropagation()}
          aria-label="Меню раздела"
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setName(currentName); setRenaming(true) }}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Переименовать
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={(e) => {
            e.preventDefault()
            if (confirm(`Удалить раздел «${currentName}»? Доски и списки останутся.`)) {
              softDelete.mutate({ id: sectionId, workspace_id: workspaceId })
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Удалить раздел
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
