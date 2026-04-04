/**
 * Project selector popover for ChatSettingsDialog.
 */

import { useState } from 'react'
import { FolderOpen, Search, X, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface WorkspaceProject {
  id: string
  name: string
  description: string | null
  project_templates: { name: string } | null
}

interface ChatSettingsProjectSelectorProps {
  workspaceProjects: WorkspaceProject[]
  selectedProjectId: string | null
  isEditMode: boolean
  onSelect: (projectId: string | null) => void
}

export function ChatSettingsProjectSelector({
  workspaceProjects,
  selectedProjectId,
  isEditMode,
  onSelect,
}: ChatSettingsProjectSelectorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [search, setSearch] = useState('')

  if (workspaceProjects.length === 0) return null

  const filtered = workspaceProjects.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="-mt-2">
      <Popover
        open={popoverOpen}
        onOpenChange={(v) => {
          setPopoverOpen(v)
          if (!v) setSearch('')
        }}
        modal
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            {selectedProjectId
              ? (workspaceProjects.find((p) => p.id === selectedProjectId)?.name ?? 'Проект')
              : 'Выбрать проект'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[346px] p-0" align="start">
          <div className="px-3 py-2 border-b">
            <div className="flex items-center gap-2 border rounded-md px-2 py-1">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Поиск проекта..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm bg-transparent focus:outline-none w-full"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="shrink-0">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[325px] overflow-y-auto py-1">
            {/* Без проекта */}
            {!search.trim() && (
              <button
                type="button"
                onClick={() => {
                  onSelect(null)
                  setPopoverOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                  !selectedProjectId ? 'bg-brand-50 font-medium' : 'hover:bg-muted/50',
                )}
              >
                <X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">Без проекта</span>
              </button>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelect(p.id)
                  setPopoverOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                  selectedProjectId === p.id ? 'bg-brand-50 font-medium' : 'hover:bg-muted/50',
                )}
              >
                <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="shrink-0">{p.name}</span>
                {p.project_templates?.name && (
                  <span className="truncate text-muted-foreground/40 font-normal">
                    {p.project_templates.name}
                  </span>
                )}
                {selectedProjectId === p.id && (
                  <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-primary" />
                )}
              </button>
            ))}
            {filtered.length === 0 && search.trim() && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
