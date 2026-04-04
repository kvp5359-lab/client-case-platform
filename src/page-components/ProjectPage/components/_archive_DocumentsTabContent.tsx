"use client"

/**
 * Содержимое вкладки "Документы"
 * Наборы документов отображаются как сворачиваемые секции (аккордеон)
 */

import { Suspense, lazy, useState, useCallback, useRef, useEffect } from 'react'
import { Plus, MoreVertical, RefreshCw, Trash2, ChevronRight, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FloatingBatchActions } from '@/components/documents'
import { useGlobalBatchActions } from '@/hooks/documents/useGlobalBatchActions'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  useSyncDocumentKitMutation,
  useDeleteDocumentKitMutation,
  useRenameDocumentKitMutation,
} from '@/hooks/useDocumentKitsQuery'
import type { DocumentKit } from '@/services/api/documentKitService'
import { cn } from '@/lib/utils'

// Lazy loading
const DocumentKitsTab = lazy(() =>
  import('@/components/projects/DocumentKitsTab').then((m) => ({ default: m.DocumentKitsTab })),
)

const SectionLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
)

interface DocumentsTabContentProps {
  documentKits: DocumentKit[]
  projectId: string
  workspaceId: string
  canAddDocumentKits: boolean
  onOpenAddDialog: () => void
  initialSelectedKitId?: string | null
  sourceFolderId?: string | null
  exportFolderId?: string | null
}

export function DocumentsTabContent({
  documentKits,
  projectId,
  workspaceId,
  canAddDocumentKits,
  onOpenAddDialog,
  initialSelectedKitId,
  sourceFolderId,
  exportFolderId,
}: DocumentsTabContentProps) {
  const syncMutation = useSyncDocumentKitMutation()
  const deleteMutation = useDeleteDocumentKitMutation()
  const renameMutation = useRenameDocumentKitMutation()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Inline-редактирование названия набора
  const [editingKitId, setEditingKitId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingKitId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingKitId])

  const startRenaming = (kit: DocumentKit) => {
    setEditingKitId(kit.id)
    setEditingName(kit.name)
  }

  const commitRename = () => {
    if (!editingKitId) return
    const trimmed = editingName.trim()
    if (trimmed && trimmed !== documentKits.find((k) => k.id === editingKitId)?.name) {
      renameMutation.mutate({ kitId: editingKitId, name: trimmed, projectId })
    }
    setEditingKitId(null)
  }

  const cancelRename = () => {
    setEditingKitId(null)
  }

  // Глобальные batch actions (cross-kit selection)
  const globalBatch = useGlobalBatchActions({ projectId, workspaceId })

  // Ключ для localStorage — уникален по проекту
  const storageKey = `doc-kits-open-${projectId}`

  // Открытые секции — восстанавливаем из localStorage
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    if (initialSelectedKitId) {
      return new Set([initialSelectedKitId])
    }
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const ids = JSON.parse(saved) as string[]
        if (Array.isArray(ids) && ids.length > 0) return new Set(ids)
      }
    } catch {
      // ignore
    }
    return new Set(documentKits.length > 0 ? [documentKits[0].id] : [])
  })

  const toggleSection = useCallback(
    (kitId: string) => {
      setOpenSections((prev) => {
        const next = new Set(prev)
        if (next.has(kitId)) {
          next.delete(kitId)
        } else {
          next.add(kitId)
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
        } catch {
          // ignore
        }
        return next
      })
    },
    [storageKey],
  )

  const handleSyncDocumentKit = async (kit: DocumentKit) => {
    const ok = await confirm({
      title: `Обновить состав набора «${kit.name}»?`,
      description:
        'Названия, описания и настройки папок будут обновлены в соответствии с текущим шаблоном. Документы в папках останутся без изменений.',
      confirmText: 'Обновить',
    })
    if (!ok) return

    try {
      await syncMutation.mutateAsync({ kitId: kit.id, projectId })
      toast.success('Состав набора обновлён')
    } catch (error) {
      logger.error('Ошибка синхронизации набора документов:', error)
      // toast уже показывается в мутации
    }
  }

  const handleDeleteDocumentKit = async (kit: DocumentKit) => {
    const ok = await confirm({
      title: `Удалить набор «${kit.name}»?`,
      description: 'Все документы в этом наборе будут удалены.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return

    try {
      await deleteMutation.mutateAsync({ kitId: kit.id, projectId })
      toast.success('Набор документов удалён')
      setOpenSections((prev) => {
        const next = new Set(prev)
        next.delete(kit.id)
        return next
      })
    } catch (error) {
      logger.error('Ошибка удаления набора документов:', error)
      // toast уже показывается в мутации
    }
  }

  if (documentKits.length === 0) {
    return (
      <div className="space-y-4">
        {canAddDocumentKits && (
          <Button variant="outline" size="sm" onClick={onOpenAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить набор документов
          </Button>
        )}
        <div className="rounded-lg border p-12">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">Наборы документов</h3>
            <p className="text-muted-foreground">
              Пока нет добавленных наборов документов. Создайте первый!
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <ConfirmDialog {...globalBatch.confirmDialogProps} />
      <FloatingBatchActions {...globalBatch.batchActionsProps} />
      {/* Первый набор: с тулбаром и системной секцией (общие для всех наборов) */}
      <Suspense fallback={<SectionLoader />}>
        <DocumentKitsTab
          projectId={projectId}
          workspaceId={workspaceId}
          kitId={documentKits[0].id}
          sourceFolderId={sourceFolderId}
          exportFolderId={exportFolderId}
          showSystemSection
          showToolbar
          showFolders={false}
        />
      </Suspense>

      {/* Сворачиваемые секции наборов */}
      {documentKits.map((kit) => {
        const isOpen = openSections.has(kit.id)
        return (
          <Collapsible key={kit.id} open={isOpen} onOpenChange={() => toggleSection(kit.id)}>
            <div
              className={cn(
                'rounded-2xl',
                isOpen
                  ? 'border-2 border-foreground shadow-[0_2px_28px_-2px_rgba(0,0,0,0.13)]'
                  : 'border border-border',
              )}
            >
              {/* Заголовок секции */}
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5',
                  isOpen ? 'rounded-t-2xl border-b bg-background' : 'rounded-2xl bg-muted/50',
                )}
              >
                {editingKitId === kit.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        isOpen && 'rotate-90',
                      )}
                    />
                    <input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') cancelRename()
                      }}
                      className="text-base font-medium bg-transparent border-b-2 border-primary outline-none flex-1 min-w-0 py-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ) : (
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex flex-1 items-center gap-2 text-left"
                      onDoubleClick={(e) => {
                        if (canAddDocumentKits) {
                          e.preventDefault()
                          e.stopPropagation()
                          startRenaming(kit)
                        }
                      }}
                    >
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          isOpen && 'rotate-90',
                        )}
                      />
                      <span className="text-base font-medium">{kit.name}</span>
                    </button>
                  </CollapsibleTrigger>
                )}

                {canAddDocumentKits && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          startRenaming(kit)
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Переименовать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSyncDocumentKit(kit)
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Обновить состав набора
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteDocumentKit(kit)
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить набор
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Содержимое секции — только папки и документы */}
              <CollapsibleContent>
                <div className="px-5 py-3">
                  <Suspense fallback={<SectionLoader />}>
                    <DocumentKitsTab
                      projectId={projectId}
                      workspaceId={workspaceId}
                      kitId={kit.id}
                      sourceFolderId={sourceFolderId}
                      exportFolderId={exportFolderId}
                      showSystemSection={false}
                      showToolbar={false}
                    />
                  </Suspense>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )
      })}

      {canAddDocumentKits && (
        <Button variant="outline" size="sm" onClick={onOpenAddDialog} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Добавить набор документов
        </Button>
      )}
    </div>
  )
}
