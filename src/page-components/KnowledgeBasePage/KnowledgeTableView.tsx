/**
 * KnowledgeTableView — табличный вид статей в стиле Notion.
 *
 * Колонки: Статус | Название | Группы | Теги
 * Фильтрация: Notion-style (кнопка «Фильтр» → строка чипов → попап с чекбоксами).
 */

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NativeTable,
  NativeTableHead,
  NativeTableBody,
  NativeTableRow,
  NativeTableCell,
  NativeTableHeadCell,
} from '@/components/ui/native-table'
import { StatusDropdown } from '@/components/common/status-dropdown'
import { Plus, Search, FolderPlus, Tags, BookOpen, Trash2, Filter, ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { KnowledgeFilterBar } from './components/KnowledgeFilterBar'
import { InlineGroupsCell, InlineTagsCell } from './components/InlineCells'
import { ManageGroupsDialog } from './components/ManageGroupsDialog'
import { ManageTagsDialog } from './components/ManageTagsDialog'
import type { useKnowledgeBasePage } from './useKnowledgeBasePage'
import { RowsSkeleton } from '@/components/ui/loaders'

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

  const hasActiveFilters =
    page.filterTagIds.length > 0 ||
    page.filterGroupIds.length > 0 ||
    page.filterStatusIds.length > 0 ||
    page.advancedFilter.rules.length > 0

  // Сортировка таблицы (локальная): null = порядок по умолчанию (title из запроса).
  const [sortField, setSortField] = useState<'title' | 'created_at' | 'updated_at' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

  const toggleSort = (field: 'title' | 'created_at' | 'updated_at') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedArticles = useMemo(() => {
    const arr = page.filteredArticles
    if (!sortField) return arr
    const mult = sortDir === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      const cmp =
        sortField === 'title'
          ? a.title.localeCompare(b.title)
          : new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
      return cmp * mult
    })
  }, [page.filteredArticles, sortField, sortDir])

  const SORT_FIELDS: { key: 'title' | 'created_at' | 'updated_at'; label: string }[] = [
    { key: 'title', label: 'Название' },
    { key: 'created_at', label: 'Дата создания' },
    { key: 'updated_at', label: 'Дата изменения' },
  ]
  const activeSortLabel =
    (sortField && SORT_FIELDS.find((f) => f.key === sortField)?.label) || 'Сортировка'

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
          variant={page.showFilters || hasActiveFilters ? 'secondary' : 'outline'}
          className="w-8 h-8 p-0"
          onClick={() => page.setShowFilters((v) => !v)}
          title="Фильтр"
        >
          <Filter className="w-4 h-4" />
        </Button>
        {/* Селектор сортировки */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant={sortField ? 'secondary' : 'outline'}>
              <ArrowUpDown className="w-4 h-4 mr-1.5" />
              {activeSortLabel}
              {sortField &&
                (sortDir === 'asc' ? (
                  <ArrowUp className="w-3 h-3 ml-1" />
                ) : (
                  <ArrowDown className="w-3 h-3 ml-1" />
                ))}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SORT_FIELDS.map((f) => (
              <DropdownMenuItem key={f.key} onClick={() => toggleSort(f.key)} className="gap-4">
                <span className="flex-1">{f.label}</span>
                {sortField === f.key &&
                  (sortDir === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5" />
                  ))}
              </DropdownMenuItem>
            ))}
            {sortField && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortField(null)}>Без сортировки</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Управление справочниками — свёрнуто в меню «⋯» */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="w-8 h-8 p-0" title="Ещё">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setGroupsOpen(true)} className="gap-2">
              <FolderPlus className="w-4 h-4" />
              Управление группами
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTagsOpen(true)} className="gap-2">
              <Tags className="w-4 h-4" />
              Управление тегами
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          onClick={() => page.createArticleMutation.mutate(undefined)}
          disabled={page.createArticleMutation.isPending}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Статья
        </Button>
      </div>

      {/* Диалоги управления справочниками (открываются из «⋯») */}
      <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
        <ManageGroupsDialog page={page} />
      </Dialog>
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <ManageTagsDialog page={page} />
      </Dialog>

      {/* Строка фильтров (чипы статус/группа/тег + доп. поля + «+ Фильтр») */}
      {page.showFilters && <KnowledgeFilterBar page={page} />}

      {/* Table */}
      {isLoading ? (
        <RowsSkeleton count={6} />
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
              {sortedArticles.map((article) => (
                <NativeTableRow
                  key={article.id}
                  className="cursor-pointer group"
                  onClick={() =>
                    page.navigate(
                      `/workspaces/${page.workspaceId}/knowledge-base/${article.id}`,
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
                        className="md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
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

              {sortedArticles.length === 0 && (
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
