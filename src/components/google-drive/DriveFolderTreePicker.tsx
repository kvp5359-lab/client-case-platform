"use client"

/**
 * Переиспользуемый выбор папки на Google Drive деревом.
 *
 * Грузит всю структуру подпапок проекта (edge `google-drive-create-folder`,
 * action `tree`), рисует корень + раскрываемое дерево, отдаёт выбранную папку
 * наружу. Используется в диалоге создания подпапок и в диалоге добавления анкеты.
 */

import { useState, useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { cn } from '@/lib/utils'
import { FolderOpen, Loader2, Check, ChevronRight } from 'lucide-react'

export type DriveFolderRef = { id: string; name: string }

type DriveFolderNode = {
  id: string
  name: string
  children: DriveFolderNode[]
}

/** Натуральная сортировка дерева по имени (1, 2, … 10), рекурсивно. */
function sortTreeDeep(nodes: DriveFolderNode[]): DriveFolderNode[] {
  return [...nodes]
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
    .map((n) => ({ ...n, children: sortTreeDeep(n.children) }))
}

type DriveFolderTreePickerProps = {
  workspaceId: string
  projectFolderId: string
  selectedFolderId: string | null
  onSelect: (folder: DriveFolderRef) => void
  /** Авто-выбрать корень после загрузки, если ничего не выбрано. */
  autoSelectRoot?: boolean
  /** Изменение значения форсит перезагрузку дерева (например, после создания папки). */
  reloadKey?: number
  maxHeightClassName?: string
}

export function DriveFolderTreePicker({
  workspaceId,
  projectFolderId,
  selectedFolderId,
  onSelect,
  autoSelectRoot = false,
  reloadKey = 0,
  maxHeightClassName = 'max-h-[260px]',
}: DriveFolderTreePickerProps) {
  const [tree, setTree] = useState<DriveFolderNode[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [rootName, setRootName] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (projectFolderId) loadFolderTree()
  }, [projectFolderId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFolderTree = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { action: 'tree', workspaceId, folderId: projectFolderId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setTree(sortTreeDeep(data?.tree || []))
      setTruncated(!!data?.truncated)
      const rn = (data?.folderName as string) || null
      setRootName(rn)
      if (autoSelectRoot && !selectedFolderId) {
        onSelect({ id: projectFolderId, name: rn ?? 'Корневая папка проекта' })
      }
    } catch (error) {
      logger.error('Failed to load folder tree:', error)
      toast.error('Не удалось загрузить список папок')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderNode = (node: DriveFolderNode, depth: number): ReactNode => {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.id)
    const selected = selectedFolderId === node.id
    return (
      <div key={node.id}>
        <div
          className={cn(
            'flex items-center rounded-md',
            selected ? 'bg-amber-50' : 'hover:bg-muted/50',
          )}
          style={{ paddingLeft: depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleCollapse(node.id)}
              className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
              title={isCollapsed ? 'Развернуть' : 'Свернуть'}
            >
              <ChevronRight
                className={cn('h-3.5 w-3.5 transition-transform', !isCollapsed && 'rotate-90')}
              />
            </button>
          ) : (
            <span className="w-[22px] flex-shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelect({ id: node.id, name: node.name })}
            className={cn(
              'flex items-center gap-2 flex-1 min-w-0 px-1 py-1.5 text-sm text-left',
              selected ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{node.name}</span>
            {selected && <Check className="h-3.5 w-3.5 ml-auto text-amber-600 flex-shrink-0" />}
          </button>
        </div>
        {hasChildren && !isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  const rootSelected = selectedFolderId === projectFolderId

  return (
    <div className={cn('rounded-md border py-2 px-1 overflow-y-auto space-y-0.5', maxHeightClassName)}>
      {/* Корневая папка проекта */}
      <div
        className={cn(
          'flex items-center rounded-md',
          rootSelected ? 'bg-amber-50' : 'hover:bg-muted/50',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect({ id: projectFolderId, name: rootName ?? 'Корневая папка проекта' })}
          className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1.5 text-sm text-left text-foreground font-medium"
        >
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span className="truncate">{rootName ?? 'Корневая папка проекта'}</span>
          {rootName && (
            <span className="text-xs text-muted-foreground flex-shrink-0">(корень проекта)</span>
          )}
          {rootSelected && <Check className="h-3.5 w-3.5 ml-auto text-amber-600 flex-shrink-0" />}
        </button>
      </div>

      {/* Дерево вложенных папок */}
      {tree.map((node) => renderNode(node, 0))}

      {isLoading && (
        <div className="flex items-center gap-2 pl-[22px] py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загрузка папок…
        </div>
      )}
      {!isLoading && tree.length === 0 && (
        <p className="pl-[22px] py-1 text-xs text-muted-foreground">Внутри пока нет папок</p>
      )}
      {truncated && (
        <p className="pl-[22px] py-1 text-xs text-muted-foreground">
          Показаны не все папки — структура слишком большая или глубокая.
        </p>
      )}
    </div>
  )
}
