/**
 * KnowledgeTableView — табличный вид статей в стиле Notion.
 *
 * Колонки: Статус | Название | Группы | Теги
 * Фильтрация: Notion-style (кнопка «Фильтр» → строка чипов → попап с чекбоксами).
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import {
  NativeTable,
  NativeTableHead,
  NativeTableBody,
  NativeTableRow,
  NativeTableCell,
  NativeTableHeadCell,
} from '@/components/ui/native-table'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { Plus, Search, FolderPlus, Tags, BookOpen, Trash2, Filter } from 'lucide-react'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { NotionFilterRow } from './components/NotionFilterRow'
import { InlineGroupsCell, InlineTagsCell } from './components/InlineCells'
import { ManageGroupsDialog } from './components/ManageGroupsDialog'
import { ManageTagsDialog } from './components/ManageTagsDialog'
import type { useKnowledgeBasePage } from './useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

// ---------- Table columns ----------

const COLUMNS = [
  { key: 'status', width: '36px' },
  { key: 'title', width: 'auto' },
  { key: 'groups', width: '180px' },
  { key: 'tags', width: '180px' },
  { key: 'author', width: '130px' },
  { key: 'created', width: '80px' },
  { key: 'updated', width: '80px' },
]

// ---------- Main component ----------

export function KnowledgeTableView({ page }: { page: PageReturn }) {
  const isLoading = page.articlesQuery.isLoading || page.groupsQuery.isLoading
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters =
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск статей..."
            className="pl-9 h-8 text-sm"
            value={page.searchQuery}
            onChange={(e) => page.setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant={showFilters || hasActiveFilters ? 'secondary' : 'outline'}
          className="w-8 h-8 p-0"
          onClick={() => setShowFilters((v) => !v)}
          title="Фильтр"
        >
          <Filter className="w-4 h-4" />
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <FolderPlus className="w-4 h-4 mr-1.5" />
              Группы
            </Button>
          </DialogTrigger>
          <ManageGroupsDialog page={page} />
        </Dialog>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Tags className="w-4 h-4 mr-1.5" />
              Теги
            </Button>
          </DialogTrigger>
          <ManageTagsDialog page={page} />
        </Dialog>
        <Button
          size="sm"
          onClick={() => page.createArticleMutation.mutate(undefined)}
          disabled={page.createArticleMutation.isPending}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Статья
        </Button>
      </div>

      {/* Notion-style filter bar */}
      {showFilters && (
        <NotionFilterRow
          status={{
            selectedIds: page.filterStatusIds,
            onToggle: (id) =>
              page.setFilterStatusIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterStatusIds([]),
            options: page.statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
          }}
          group={{
            selectedIds: page.filterGroupIds,
            onToggle: (id) =>
              page.setFilterGroupIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterGroupIds([]),
            options: page.groups.map((g) => ({ id: g.id, name: g.name })),
            treeGroups: page.groups,
          }}
          tag={{
            selectedIds: page.filterTagIds,
            onToggle: (id) =>
              page.setFilterTagIds((prev: string[]) =>
                prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id],
              ),
            onClear: () => page.setFilterTagIds([]),
            options: page.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
          }}
        />
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : page.articles.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Нет статей</h3>
            <p className="text-muted-foreground mb-4">Создайте первую статью для базы знаний</p>
            <Button onClick={() => page.createArticleMutation.mutate(undefined)}>
              <Plus className="w-4 h-4 mr-2" />
              Создать статью
            </Button>
          </div>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <NativeTable columns={COLUMNS}>
            <NativeTableHead>
              <NativeTableRow isHeader>
                <NativeTableHeadCell />
                <NativeTableHeadCell>Название</NativeTableHeadCell>
                <NativeTableHeadCell>Группа</NativeTableHeadCell>
                <NativeTableHeadCell>Теги</NativeTableHeadCell>
                <NativeTableHeadCell>Автор</NativeTableHeadCell>
                <NativeTableHeadCell>Создана</NativeTableHeadCell>
                <NativeTableHeadCell withDivider={false}>Изменена</NativeTableHeadCell>
              </NativeTableRow>
            </NativeTableHead>
            <NativeTableBody>
              {page.filteredArticles.map((article) => (
                <NativeTableRow
                  key={article.id}
                  className="cursor-pointer group"
                  onClick={() =>
                    page.navigate(
                      `/workspaces/${page.workspaceId}/settings/knowledge-base/${article.id}`,
                    )
                  }
                >
                  {/* Status */}
                  <NativeTableCell className="text-center">
                    <div onClick={(e) => e.stopPropagation()}>
                      <StatusDropdown
                        currentStatus={article.statuses}
                        statuses={page.statuses}
                        onStatusChange={(statusId) =>
                          page.updateStatusMutation.mutate({
                            articleId: article.id,
                            statusId,
                          })
                        }
                        size="sm"
                      />
                    </div>
                  </NativeTableCell>

                  {/* Title */}
                  <NativeTableCell className="font-medium truncate">
                    {article.title}
                  </NativeTableCell>

                  {/* Groups */}
                  <NativeTableCell>
                    <InlineGroupsCell article={article} page={page} />
                  </NativeTableCell>

                  {/* Tags */}
                  <NativeTableCell>
                    <InlineTagsCell article={article} page={page} />
                  </NativeTableCell>

                  {/* Author */}
                  <NativeTableCell className="text-xs text-muted-foreground truncate">
                    {article.author_name || article.author_email?.split('@')[0] || '—'}
                  </NativeTableCell>

                  {/* Created at */}
                  <NativeTableCell className="text-xs text-muted-foreground">
                    {formatSmartDate(article.created_at)}
                  </NativeTableCell>

                  {/* Updated at */}
                  <NativeTableCell withDivider={false}>
                    <div className="flex items-center gap-1">
                      <span className="flex-1 text-xs text-muted-foreground">
                        {formatSmartDate(article.updated_at)}
                      </span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          page.handleDeleteArticle(article.id, article.title)
                        }}
                        title="Удалить"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  </NativeTableCell>
                </NativeTableRow>
              ))}

              {page.filteredArticles.length === 0 && (
                <NativeTableRow>
                  <NativeTableCell
                    colSpan={7}
                    withDivider={false}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Статьи не найдены
                  </NativeTableCell>
                </NativeTableRow>
              )}
            </NativeTableBody>
          </NativeTable>
        </div>
      )}

      {/* Counter */}
      {!isLoading && page.articles.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {page.filteredArticles.length} из {page.articles.length} статей
        </div>
      )}
    </div>
  )
}
