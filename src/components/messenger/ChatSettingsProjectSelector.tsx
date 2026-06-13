/**
 * Project selector popover for ChatSettingsDialog.
 */

import { lazy, Suspense, useState } from 'react'
import { FolderOpen, Search, X, Check, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Тяжёлый диалог создания проекта (тянет шаблоны/киты) — грузим лениво, только
// когда жмут «+». Иначе он попадал бы в бандл везде, где есть селектор проекта.
const CreateProjectDialog = lazy(() =>
  import('@/components/projects/CreateProjectDialog').then((m) => ({
    default: m.CreateProjectDialog,
  })),
)

type WorkspaceProject = {
  id: string
  name: string
  description: string | null
  project_templates: { name: string } | null
}

type ChatSettingsProjectSelectorProps = {
  workspaceProjects: WorkspaceProject[]
  selectedProjectId: string | null
  isEditMode: boolean
  onSelect: (projectId: string | null) => void
  /** Префилл имени при создании нового проекта через «+» (напр. имя контакта). */
  createDefaultName?: string
  /** Цвет триггер-кнопки: 'brand' (золотой, по умолчанию) или 'muted' (серый, для шапки панели). */
  variant?: 'brand' | 'muted'
}

export function ChatSettingsProjectSelector({
  workspaceProjects,
  selectedProjectId,
  isEditMode: _isEditMode,
  onSelect,
  createDefaultName,
  variant = 'brand',
}: ChatSettingsProjectSelectorProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = workspaceProjects.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
  })

  return (
    <>
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
          className={cn(
            'flex items-center gap-1.5 text-sm rounded px-2 py-1 transition-colors shrink-0',
            variant === 'muted'
              ? selectedProjectId
                ? 'text-gray-700 bg-gray-200/70 hover:bg-gray-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/60'
              : selectedProjectId
                ? 'text-brand-700 bg-brand-100/75 hover:bg-brand-100'
                : 'text-brand-500/70 hover:text-brand-600 hover:bg-brand-100/75',
          )}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          {selectedProjectId
            ? (workspaceProjects.find((p) => p.id === selectedProjectId)?.name ?? 'Проект')
            : 'Выбрать проект'}
        </button>
      </PopoverTrigger>
        <PopoverContent className="w-[346px] p-0" align="start">
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <div className="flex items-center gap-2 border rounded-md px-2 py-1 flex-1 min-w-0">
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
            {/* Создать новый проект из шаблона — справа от поиска. */}
            <button
              type="button"
              onClick={() => {
                setPopoverOpen(false)
                setCreateOpen(true)
              }}
              title="Создать новый проект"
              aria-label="Создать новый проект"
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md border text-brand-600 hover:bg-brand-100/75 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
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
      {createOpen && (
        <Suspense fallback={null}>
          <CreateProjectDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            defaultName={createDefaultName}
            onSuccess={(project) => {
              onSelect(project.id)
              setCreateOpen(false)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
