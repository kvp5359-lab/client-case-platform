"use client"

/**
 * Под-пункт меню «Разделы…» для доски или списка. Чекбоксы разделов (м-к-м):
 * клик добавляет/убирает элемент из раздела. Внизу — создание нового раздела
 * сразу с этим элементом внутри.
 *
 * Встраивается в DropdownMenuContent вкладки (BoardTab / ItemListTab).
 */

import { useState } from 'react'
import { FolderTree, Plus } from 'lucide-react'
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  useSections,
  useSectionMaps,
  useToggleSectionItem,
  useCreateSection,
  type SectionItemType,
} from '@/hooks/useSections'

type Props = {
  workspaceId: string
  itemType: SectionItemType
  itemId: string
  /** Может ли пользователь менять разделы (владелец/менеджер). */
  canManage: boolean
}

export function SectionAssignSubmenu({ workspaceId, itemType, itemId, canManage }: Props) {
  const { data: sections = [] } = useSections(workspaceId)
  const { byItem } = useSectionMaps(workspaceId)
  const toggle = useToggleSectionItem()
  const createSection = useCreateSection()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  if (!canManage) return null

  const memberOf = new Set(byItem.get(`${itemType}:${itemId}`) ?? [])

  const handleCreate = () => {
    const n = name.trim()
    if (!n) return
    createSection.mutate(
      { workspace_id: workspaceId, name: n },
      {
        onSuccess: (section) => {
          toggle.mutate({ workspace_id: workspaceId, section_id: section.id, item_type: itemType, item_id: itemId, present: false })
          setName('')
          setCreating(false)
        },
      },
    )
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderTree className="h-3.5 w-3.5 mr-2" />
        Разделы…
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {sections.length === 0 && !creating && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Разделов пока нет</div>
        )}
        {sections.map((s) => {
          const present = memberOf.has(s.id)
          return (
            <DropdownMenuCheckboxItem
              key={s.id}
              checked={present}
              onSelect={(e) => {
                e.preventDefault()
                toggle.mutate({ workspace_id: workspaceId, section_id: s.id, item_type: itemType, item_id: itemId, present })
              }}
            >
              {s.name}
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        {creating ? (
          <div className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
                if (e.key === 'Escape') { setCreating(false); setName('') }
              }}
              placeholder="Название раздела"
              className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ) : (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setCreating(true) }}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            Новый раздел
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
