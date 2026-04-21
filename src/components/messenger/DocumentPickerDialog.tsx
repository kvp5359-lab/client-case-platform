/**
 * Диалог выбора документов из проекта.
 * Используется в AI-ассистенте и мессенджере.
 */

import { useState, useMemo } from 'react'
import { Folder, CheckSquare, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { DocumentForAi } from '@/services/api/messenger/messengerAiService'

interface DocumentPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: DocumentForAi[]
  statusMap: Map<string, { color?: string | null }>
  onConfirm: (selectedIds: Set<string>) => void
  confirmLabel?: string
  isLoading?: boolean
  /** Предвыбранные ID документов */
  initialSelected?: Set<string>
}

export function DocumentPickerDialog({
  open,
  onOpenChange,
  documents,
  statusMap,
  onConfirm,
  confirmLabel = 'Готово',
  isLoading,
  initialSelected,
}: DocumentPickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(initialSelected ?? new Set())

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  // Группировка документов по Kit -> Folder
  const groupedDocuments = useMemo(() => {
    type DocItem = (typeof documents)[number]
    type FolderGroup = { folderName: string | null; folderSortOrder: number; docs: DocItem[] }

    const kitMap = new Map<string, Map<string | null, FolderGroup>>()

    for (const doc of documents) {
      const kit = doc.kitName || 'Без набора'
      const folder = doc.folderName || null
      if (!kitMap.has(kit)) kitMap.set(kit, new Map())
      const folderMap = kitMap.get(kit)!
      if (!folderMap.has(folder)) {
        folderMap.set(folder, {
          folderName: folder,
          folderSortOrder: doc.folderSortOrder ?? 999,
          docs: [],
        })
      }
      folderMap.get(folder)!.docs.push(doc)
    }

    const groups: Array<{
      kitName: string
      folders: Array<FolderGroup & { folderIndex: number }>
    }> = []

    for (const [kitName, folderMapVal] of kitMap) {
      const allFolders = [...folderMapVal.values()]
      const ungrouped = allFolders.filter((f) => f.folderName === null)
      const named = allFolders
        .filter((f) => f.folderName !== null)
        .sort((a, b) => a.folderSortOrder - b.folderSortOrder)

      for (const f of [...ungrouped, ...named]) {
        f.docs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      }

      const numbered = named.map((f, i) => ({ ...f, folderIndex: i + 1 }))
      const result = [...ungrouped.map((f) => ({ ...f, folderIndex: 0 })), ...numbered]
      groups.push({ kitName, folders: result })
    }

    return groups
  }, [documents])

  const allIds = useMemo(() => documents.map((d) => d.id), [documents])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg p-0">
        <DialogHeader className="p-4 pb-2 pr-10">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-sm">
              Документы проекта ({documents.length})
            </DialogTitle>
            {allIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={toggleAll}
              >
                {allSelected ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Снять все
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-3.5 w-3.5" />
                    Отметить все
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="px-3 pb-2">
            {groupedDocuments.map((group) => (
              <div key={group.kitName} className="mb-2 last:mb-0">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 py-1">
                  {group.kitName}
                </div>
                {group.folders.map((folder) => (
                  <div key={folder.folderName ?? '__ungrouped'}>
                    {folder.folderName && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground px-1 py-0.5 mt-0.5">
                        <Folder className="h-3.5 w-3.5" />
                        <span>
                          {folder.folderIndex}. {folder.folderName}
                        </span>
                      </div>
                    )}
                    {folder.docs.map((doc) => {
                      const isSelected = selected.has(doc.id)
                      const docStatus = doc.statusId ? statusMap.get(doc.statusId) : null
                      const statusColor = docStatus?.color
                        ? safeCssColor(docStatus.color)
                        : undefined
                      const toggle = () => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(doc.id)) next.delete(doc.id)
                          else next.add(doc.id)
                          return next
                        })
                      }
                      return (
                        <div
                          key={doc.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'w-full min-w-0 flex items-center gap-1.5 py-1 rounded text-sm transition-colors cursor-pointer',
                            folder.folderName ? 'pl-5 pr-2' : 'pl-2 pr-2',
                            isSelected ? 'bg-primary/10' : 'hover:bg-muted',
                          )}
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggle()
                            }
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="h-3.5 w-3.5 shrink-0 pointer-events-none"
                          />
                          <span
                            className="truncate flex-1 min-w-0"
                            style={statusColor ? { color: statusColor } : undefined}
                          >
                            {doc.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="px-4 py-3 border-t">
          <Button size="sm" onClick={() => onConfirm(selected)} disabled={isLoading}>
            {isLoading
              ? 'Загрузка...'
              : `${confirmLabel}${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
