"use client"

/**
 * KnowledgeBasePage — единая страница базы знаний.
 *
 * Верхний ряд вкладок = виды (Дерево / Таблица / Q&A / Подбор) + сохранённые
 * представления (наборы фильтров) + кнопка «+» для создания представления из
 * текущего фильтра. Представление помнит свой вид (view_mode) и при выборе
 * применяет свой фильтр. Правки активного представления автосохраняются.
 */

import { useState } from 'react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  BookOpen,
  Compass,
  MessageCircleQuestion,
  Plus,
  TableProperties,
  TreePine,
  Users,
} from 'lucide-react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { EMPTY_FILTER_GROUP } from '@/lib/filters/types'
import { useKnowledgeBasePage } from './KnowledgeBasePage/useKnowledgeBasePage'
import { ViewTabMenu } from './KnowledgeBasePage/components/ViewTabMenu'
import { KnowledgeTreeView } from './KnowledgeBasePage/KnowledgeTreeView'
import { KnowledgeTableView } from './KnowledgeBasePage/KnowledgeTableView'
import { KnowledgeQAView } from './KnowledgeBasePage/KnowledgeQAView'
import { ResidenceMatchView } from './KnowledgeBasePage/ResidenceMatchView'

export default function KnowledgeBasePage() {
  const page = useKnowledgeBasePage()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams.get('tab')
  const activeTab =
    tabParam === 'qa' ? 'qa'
    : tabParam === 'table' ? 'table'
    : tabParam === 'residence' ? 'residence'
    : 'tree'

  // Попап создания нового представления из текущего фильтра.
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createShared, setCreateShared] = useState(false)
  const [createViewMode, setCreateViewMode] = useState<'tree' | 'table'>('tree')

  // Активное представление (если выбрано) перебивает базовую вкладку.
  const activeView = page.activeViewId
    ? page.views.find((v) => v.id === page.activeViewId)
    : null
  const tabsValue = activeView ? `view:${activeView.id}` : activeTab
  const contentView: 'tree' | 'table' | 'qa' | 'residence' = activeView
    ? activeView.view_mode === 'table'
      ? 'table'
      : 'tree'
    : activeTab

  // «+» доступна только для видов статей (дерево/таблица).
  const canCreateView = contentView === 'tree' || contentView === 'table'

  const handleTabChange = (value: string) => {
    if (value.startsWith('view:')) {
      const id = value.slice(5)
      const view = page.views.find((v) => v.id === id)
      if (view) {
        // Раскладываем фильтр представления на чипы + доп. условия.
        page.applyViewFilter(view.filter_config ?? EMPTY_FILTER_GROUP)
        page.setActiveViewId(id)
      }
      return
    }
    // Базовый вид — выходим из представления и сбрасываем фильтр.
    page.setActiveViewId(null)
    page.setAdvancedFilter(EMPTY_FILTER_GROUP)
    router.replace(value === 'tree' ? pathname : `${pathname}?tab=${value}`)
  }

  const handleCreateView = () => {
    const name = createName.trim()
    if (!name) return
    page.createView.mutate(
      {
        name,
        filterConfig: page.captureCurrentFilter(),
        shared: createShared,
        viewMode: createViewMode,
      },
      {
        onSuccess: (view) => {
          setCreateOpen(false)
          setCreateName('')
          setCreateShared(false)
          if (view?.id) {
            page.applyViewFilter(view.filter_config ?? EMPTY_FILTER_GROUP)
            page.setActiveViewId(view.id)
          }
        },
      },
    )
  }

  if (!page.workspaceId) {
    return (
      <WorkspaceLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Рабочее пространство не выбрано</p>
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-primary" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold">База знаний</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={tabsValue} onValueChange={handleTabChange} className="min-w-0">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="tree">
                  <TreePine className="w-4 h-4 mr-1.5" />
                  Дерево
                </TabsTrigger>
                <TabsTrigger value="table">
                  <TableProperties className="w-4 h-4 mr-1.5" />
                  Таблица
                </TabsTrigger>
                <TabsTrigger value="qa">
                  <MessageCircleQuestion className="w-4 h-4 mr-1.5" />
                  Q&A
                </TabsTrigger>
                <TabsTrigger value="residence">
                  <Compass className="w-4 h-4 mr-1.5" />
                  Подбор
                </TabsTrigger>

                {/* Сохранённые представления */}
                {page.views.length > 0 && (
                  <span aria-hidden className="mx-1 w-px self-stretch bg-border" />
                )}
                {page.views.map((view) => (
                  <div key={view.id} className="inline-flex items-center">
                    <TabsTrigger
                      value={`view:${view.id}`}
                      title={view.owner_user_id === null ? 'Общее представление' : 'Личное представление'}
                    >
                      {view.view_mode === 'table' ? (
                        <TableProperties className="w-4 h-4 mr-1.5" />
                      ) : (
                        <TreePine className="w-4 h-4 mr-1.5" />
                      )}
                      {view.owner_user_id === null && <Users className="w-3 h-3 mr-1 opacity-70" />}
                      <span className="max-w-[160px] truncate">{view.name}</span>
                    </TabsTrigger>
                    {page.activeViewId === view.id && <ViewTabMenu view={view} page={page} />}
                  </div>
                ))}
              </TabsList>
            </Tabs>

            {/* «+» — сохранить текущий фильтр как представление */}
            {canCreateView && (
              <Popover
                open={createOpen}
                onOpenChange={(o) => {
                  setCreateOpen(o)
                  if (o) setCreateViewMode(contentView === 'table' ? 'table' : 'tree')
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Новое представление"
                    title="Сохранить текущий фильтр как представление"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Новое представление</Label>
                    <Input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateView()
                      }}
                      placeholder="Например: Мои черновики"
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  {/* Выбор вида отображения */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Вид</Label>
                    <div className="flex items-center rounded-md border overflow-hidden">
                      {(['tree', 'table'] as const).map((mode) => {
                        const Icon = mode === 'tree' ? TreePine : TableProperties
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setCreateViewMode(mode)}
                            className={cn(
                              'flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs transition-colors',
                              createViewMode === mode
                                ? 'bg-accent text-foreground'
                                : 'text-muted-foreground hover:bg-accent/50',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {mode === 'tree' ? 'Дерево' : 'Таблица'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={createShared}
                      onCheckedChange={(v) => setCreateShared(v === true)}
                    />
                    Общее для всех сотрудников
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Дальше правки фильтра сохраняются автоматически.
                  </p>
                  <Button
                    size="sm"
                    className="w-full h-8"
                    onClick={handleCreateView}
                    disabled={!createName.trim() || page.createView.isPending}
                  >
                    Создать
                  </Button>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div>
            {contentView === 'tree' && <KnowledgeTreeView page={page} />}
            {contentView === 'table' && <KnowledgeTableView page={page} />}
            {contentView === 'qa' && <KnowledgeQAView workspaceId={page.workspaceId} />}
            {contentView === 'residence' && <ResidenceMatchView />}
          </div>
        </div>
      </div>
      <ConfirmDialog {...page.confirmDialogProps} />
    </WorkspaceLayout>
  )
}
