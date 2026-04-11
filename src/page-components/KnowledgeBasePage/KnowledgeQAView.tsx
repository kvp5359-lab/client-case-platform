"use client"

/**
 * KnowledgeQAView — Notion-style таблица Q&A элементов базы знаний.
 *
 * Колонки: Вопрос | Группы | Теги | Источник | Дата | Статус индексации
 * Фильтрация по тегам и группам (OR), поиск по тексту вопроса.
 *
 * Queries и мутации вынесены в useKnowledgeQAData
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  NativeTable,
  NativeTableHead,
  NativeTableBody,
  NativeTableRow,
  NativeTableCell,
  NativeTableHeadCell,
} from '@/components/ui/native-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Trash2,
  MoreVertical,
  RefreshCw,
  Loader2,
  Upload,
  Filter,
  MessageCircleQuestion,
} from 'lucide-react'
import { useSearchParams, usePathname } from 'next/navigation'
import { QAEditDialog } from '@/components/knowledge/QAEditDialog'
import { QAImportDialog } from '@/components/knowledge/QAImportDialog'
import { getGroupColor, NotionPill } from '@/utils/notionPill'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { KnowledgeQA } from '@/services/api/knowledge/knowledgeSearchService'
import { useKnowledgeQAData } from './useKnowledgeQAData'
import { NotionFilterRow } from './components/NotionFilterRow'
import { truncate, IndexingStatusIcon, COLUMNS, DeleteConfirmDialog } from './KnowledgeQAComponents'

// ---------- Main component ----------

interface KnowledgeQAViewProps {
  workspaceId: string
}

export function KnowledgeQAView({ workspaceId }: KnowledgeQAViewProps) {
  const router = useRouter()

  const {
    qaItems,
    tags,
    groups,
    filteredItems,
    isLoading,
    searchQuery,
    setSearchQuery,
    filterTagIds,
    setFilterTagIds,
    filterGroupIds,
    setFilterGroupIds,
    toggleTag,
    toggleGroup,
    hasFilters,
    deleteMutation,
    isReindexing,
    handleReindex,
  } = useKnowledgeQAData(workspaceId)

  // --- Dialogs ---

  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [showFilters, setShowFilters] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingQA, setEditingQA] = useState<KnowledgeQA | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Автооткрытие Q&A по qaId из URL — синхронизация с URL (внешний источник)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const qaId = searchParams.get('qaId')
    if (!qaId || qaItems.length === 0) return
    const found = qaItems.find((q) => q.id === qaId)
    if (found) {
      setEditingQA(found)
      setEditDialogOpen(true)
      const next = new URLSearchParams(searchParams.toString())
      next.delete('qaId')
      const qs = next.toString()
      router.replace(pathname + (qs ? `?${qs}` : ''))
    }
  }, [searchParams, qaItems, router, pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingQA, setDeletingQA] = useState<KnowledgeQA | null>(null)

  // --- Handlers ---

  const handleRowClick = (qa: KnowledgeQA) => {
    router.push(`/workspaces/${workspaceId}/settings/knowledge-base/qa/${qa.id}`)
  }

  const handleCreateClick = () => {
    setEditingQA(null)
    setEditDialogOpen(true)
  }

  const handleDeleteClick = (qa: KnowledgeQA, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingQA(qa)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteAction = () => {
    if (deletingQA) {
      deleteMutation.mutate(deletingQA.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false)
          setDeletingQA(null)
        },
      })
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по вопросу..."
            className="pl-9 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          size="sm"
          variant={showFilters || hasFilters ? 'secondary' : 'outline'}
          className="w-8 h-8 p-0"
          onClick={() => setShowFilters((v) => !v)}
          title="Фильтр"
        >
          <Filter className="w-4 h-4" />
        </Button>

        <Button size="sm" onClick={handleCreateClick}>
          <Plus className="w-4 h-4 mr-1.5" />
          Добавить Q&A
        </Button>

        <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
          <Upload className="w-4 h-4 mr-1.5" />
          Импорт CSV
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="w-8 h-8 p-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleReindex} disabled={isReindexing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isReindexing ? 'animate-spin' : ''}`} />
              Переиндексировать Q&A
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Notion-style filter bar */}
      {showFilters && (
        <NotionFilterRow
          group={{
            selectedIds: filterGroupIds,
            onToggle: toggleGroup,
            onClear: () => setFilterGroupIds([]),
            options: groups.map((g) => ({ id: g.id, name: g.name })),
            treeGroups: groups,
          }}
          tag={{
            selectedIds: filterTagIds,
            onToggle: toggleTag,
            onClear: () => setFilterTagIds([]),
            options: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
          }}
        />
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Загрузка...
        </div>
      ) : qaItems.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <MessageCircleQuestion className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Нет Q&A</h3>
            <p className="text-muted-foreground mb-4">
              Добавьте первый вопрос-ответ для базы знаний
            </p>
            <Button onClick={handleCreateClick}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить Q&A
            </Button>
          </div>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <NativeTable columns={COLUMNS}>
            <NativeTableHead>
              <NativeTableRow isHeader>
                <NativeTableHeadCell>Вопрос</NativeTableHeadCell>
                <NativeTableHeadCell>Группы</NativeTableHeadCell>
                <NativeTableHeadCell>Теги</NativeTableHeadCell>
                <NativeTableHeadCell>Источник</NativeTableHeadCell>
                <NativeTableHeadCell>Дата</NativeTableHeadCell>
                <NativeTableHeadCell className="text-center">Индекс</NativeTableHeadCell>
                <NativeTableHeadCell withDivider={false} />
              </NativeTableRow>
            </NativeTableHead>
            <NativeTableBody>
              {filteredItems.map((qa) => (
                <NativeTableRow
                  key={qa.id}
                  className="cursor-pointer group"
                  onClick={() => handleRowClick(qa)}
                >
                  {/* Вопрос */}
                  <NativeTableCell className="font-medium truncate" title={qa.question}>
                    {truncate(qa.question, 80)}
                  </NativeTableCell>

                  {/* Группы */}
                  <NativeTableCell>
                    <div className="flex gap-1 items-center overflow-hidden">
                      {qa.knowledge_qa_groups?.map((g) => {
                        if (!g.knowledge_groups) return null
                        const c = getGroupColor(g.knowledge_groups.name, g.knowledge_groups.color)
                        return (
                          <NotionPill
                            key={g.group_id}
                            name={g.knowledge_groups.name}
                            bg={c.bg}
                            text={c.text}
                          />
                        )
                      })}
                      {(!qa.knowledge_qa_groups || qa.knowledge_qa_groups.length === 0) && (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </NativeTableCell>

                  {/* Теги */}
                  <NativeTableCell>
                    <div className="flex items-center gap-1 overflow-hidden">
                      {qa.knowledge_qa_tags?.map((t) => (
                        <span
                          key={t.tag_id}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                          style={{ backgroundColor: safeCssColor(t.knowledge_tags.color) }}
                        >
                          {t.knowledge_tags.name}
                        </span>
                      ))}
                      {(!qa.knowledge_qa_tags || qa.knowledge_qa_tags.length === 0) && (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </NativeTableCell>

                  {/* Источник */}
                  <NativeTableCell className="text-xs text-muted-foreground truncate">
                    {qa.source || '—'}
                  </NativeTableCell>

                  {/* Дата */}
                  <NativeTableCell className="text-xs text-muted-foreground">
                    {formatSmartDate(qa.qa_date)}
                  </NativeTableCell>

                  {/* Статус индексации */}
                  <NativeTableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <IndexingStatusIcon status={qa.indexing_status} />
                    </div>
                  </NativeTableCell>

                  {/* Удалить */}
                  <NativeTableCell withDivider={false}>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteClick(qa, e)}
                      title="Удалить"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </NativeTableCell>
                </NativeTableRow>
              ))}

              {filteredItems.length === 0 && (
                <NativeTableRow>
                  <NativeTableCell
                    colSpan={7}
                    withDivider={false}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Q&A не найдены
                  </NativeTableCell>
                </NativeTableRow>
              )}
            </NativeTableBody>
          </NativeTable>
        </div>
      )}

      {/* Counter */}
      {!isLoading && qaItems.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {filteredItems.length} из {qaItems.length} записей
        </div>
      )}

      {/* QA Edit Dialog */}
      <QAEditDialog
        workspaceId={workspaceId}
        qa={editingQA}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      {/* QA Import Dialog */}
      <QAImportDialog
        workspaceId={workspaceId}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDeleteAction}
        isDeleting={deleteMutation.isPending}
        questionPreview={deletingQA?.question ?? ''}
      />
    </div>
  )
}
