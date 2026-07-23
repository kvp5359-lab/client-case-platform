"use client"

/**
 * Страница «Обновления источников» — лента файлов из привязанных источников
 * Google Drive по всему воркспейсу. Группировка «день → проект», свежие сверху.
 * Строки файлов переиспользуют `SourceFileRow` (та же строка, что в лотке набора).
 * Показываются только проекты, к которым у пользователя есть доступ; заголовок
 * проекта кликабелен — переход в проект. Кнопка «Проверить источники»
 * синхронизирует все источники воркспейса.
 */

import { Fragment, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  FolderSync,
  RefreshCw,
  FolderOpen,
  Folder,
  ChevronRight,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
} from 'lucide-react'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/hooks/usePageTitle'
import {
  useWorkspaceSourceUpdatesQuery,
  useSyncWorkspaceSources,
  useToggleKitSourceHidden,
  useSourceUpdatesUnread,
  useSourceReadMarks,
  useMyExecutorProjectIds,
  useMarkSourceUpdatesReadMutation,
  useMarkAllSourceUpdatesReadMutation,
} from '@/hooks/documents/useSourceDocumentsQuery'
import { SourceFileRow } from '@/components/documents/Documents/SourceFileRow'
import { isSourceUpdateUnread } from '@/lib/sourceUpdates'
import type { SourceDocument } from '@/types/documents'
import type { WorkspaceSourceUpdate } from '@/services/documents/sourceDocumentService'

const MONTHS_LONG_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** «Сегодня» / «Вчера» / «8 июля 2026» (год скрыт для текущего). */
function dayLabel(d: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Вчера'
  const y = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS_LONG_RU[d.getMonth()]}${y}`
}

/** Время «появления» файла: дата создания в Drive → изменения → синка. */
function updateTime(u: WorkspaceSourceUpdate): string | null {
  return u.createdTime || u.modifiedTime || u.syncedAt
}

/** WorkspaceSourceUpdate → SourceDocument (форма, которую ест SourceFileRow). */
function toSourceDoc(u: WorkspaceSourceUpdate): SourceDocument {
  return {
    id: u.googleDriveFileId,
    name: u.name,
    mimeType: u.mimeType || '',
    size: u.fileSize ?? undefined,
    createdTime: u.createdTime ?? undefined,
    modifiedTime: u.modifiedTime ?? undefined,
    webViewLink: u.webViewLink ?? undefined,
    parentFolderName: u.parentFolderName ?? undefined,
    sourceId: u.sourceId ?? undefined,
    sourceDocumentId: u.id,
    isHidden: false,
  }
}

type FolderGroup = {
  key: string
  label: string
  items: WorkspaceSourceUpdate[]
  /** Сквозной индекс первого файла папки в проекте — для непрерывной зебры
   *  поверх подзаголовков папок. */
  startIndex: number
}
type ProjectGroup = {
  projectId: string
  projectName: string
  count: number
  folders: FolderGroup[]
}
type DayGroup = { dayKey: string; label: string; projects: ProjectGroup[] }

/** Папка файла внутри проекта (подпапка источника; пусто → «Корневая папка»). */
function folderLabelOf(u: WorkspaceSourceUpdate): string {
  return u.parentFolderName || u.sourceName || 'Корневая папка'
}

export default function SourceUpdatesPage() {
  usePageTitle('Обновления источников')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  const { data: updates = [], isLoading: updatesLoading } =
    useWorkspaceSourceUpdatesQuery(workspaceId)
  // Раздел показывает обновления только по проектам, где пользователь —
  // исполнитель ИЛИ администратор проекта (клиентам/участникам/прочим — не нужно).
  const { data: executorProjectIds = [], isLoading: projectsLoading } =
    useMyExecutorProjectIds(workspaceId)
  const { run: runSync, isRunning: syncing, progress: syncProgress } = useSyncWorkspaceSources()
  const toggleHidden = useToggleKitSourceHidden()
  const { data: unread = [] } = useSourceUpdatesUnread(workspaceId)
  const { data: readMarks, isLoading: marksLoading } = useSourceReadMarks()
  const markRead = useMarkSourceUpdatesReadMutation()
  const markAllRead = useMarkAllSourceUpdatesReadMutation()

  // По умолчанию — только непрочитанные; прочитанные включаются тумблером.
  const [showRead, setShowRead] = useState(false)

  const executorIds = useMemo(() => new Set(executorProjectIds), [executorProjectIds])

  // «Файл непрочитан» — общая чистая формула (зеркало серверной, см. lib/sourceUpdates).
  const isUnreadFile = useMemo(() => {
    const lastSeen = new Map((readMarks?.reads ?? []).map((r) => [r.projectId, r.lastSeenAt]))
    const epoch = readMarks?.epochAt ?? new Date(0).toISOString()
    return (u: WorkspaceSourceUpdate) =>
      isSourceUpdateUnread(u.createdAtDb, lastSeen.get(u.projectId), epoch)
  }, [readMarks])

  // Проекты с непрочитанными (RPC уже скоуплен по исполнителю; пересечение —
  // страховка на случай рассинхрона кэшей).
  const unreadProjectIds = useMemo(
    () => new Set(unread.filter((u) => executorIds.has(u.projectId)).map((u) => u.projectId)),
    [unread, executorIds],
  )

  // Группировка «день → проект». Список сортируем по свежести (desc), Map
  // сохраняет порядок первого появления → и дни, и проекты идут по свежести.
  const days = useMemo<DayGroup[]>(() => {
    const sorted = updates
      .filter((u) => executorIds.has(u.projectId))
      .filter((u) => showRead || isUnreadFile(u))
      .map((u) => ({ u, t: updateTime(u) }))
      .filter((x): x is { u: WorkspaceSourceUpdate; t: string } => !!x.t)
      .sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())

    // День → проект → папка. Map хранит порядок первого появления: т.к. список
    // отсортирован по свежести (desc), и проекты, и папки внутри идут свежими сверху.
    type FolderBuild = { key: string; label: string; items: WorkspaceSourceUpdate[] }
    type ProjBuild = {
      projectId: string
      projectName: string
      count: number
      folderMap: Map<string, FolderBuild>
    }
    const dayMap = new Map<string, { label: string; projMap: Map<string, ProjBuild> }>()
    for (const { u, t } of sorted) {
      const d = new Date(t)
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      let day = dayMap.get(dayKey)
      if (!day) {
        day = { label: dayLabel(d), projMap: new Map() }
        dayMap.set(dayKey, day)
      }
      let pg = day.projMap.get(u.projectId)
      if (!pg) {
        pg = {
          projectId: u.projectId,
          projectName: u.projectName || 'Без проекта',
          count: 0,
          folderMap: new Map(),
        }
        day.projMap.set(u.projectId, pg)
      }
      const fKey = folderLabelOf(u)
      let fg = pg.folderMap.get(fKey)
      if (!fg) {
        fg = { key: fKey, label: fKey, items: [] }
        pg.folderMap.set(fKey, fg)
      }
      fg.items.push(u)
      pg.count += 1
    }

    return [...dayMap.entries()].map(([dayKey, day]) => ({
      dayKey,
      label: day.label,
      projects: [...day.projMap.values()].map((pg) => {
        let offset = 0
        const folders: FolderGroup[] = [...pg.folderMap.values()].map((fg) => {
          const out: FolderGroup = { ...fg, startIndex: offset }
          offset += fg.items.length
          return out
        })
        return {
          projectId: pg.projectId,
          projectName: pg.projectName,
          count: pg.count,
          folders,
        }
      }),
    }))
  }, [updates, executorIds, showRead, isUnreadFile])

  const isLoading = updatesLoading || projectsLoading || marksLoading

  const handleSync = () => {
    if (!workspaceId || syncing) return
    void runSync(workspaceId)
  }

  const syncPct =
    syncProgress && syncProgress.total > 0
      ? Math.round((syncProgress.done / syncProgress.total) * 100)
      : 0

  const openProject = (projectId: string) => {
    if (projectId) router.push(`/workspaces/${workspaceId}/projects/${projectId}`)
  }

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold">Обновления источников</h1>
            <div className="flex items-center gap-2 shrink-0">
              {/* Пока файлов нет вовсе — переключать нечего, кнопку не показываем. */}
              {updates.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setShowRead((v) => !v)}
                title={
                  showRead
                    ? 'Скрыть прочитанные — оставить только новые файлы'
                    : 'Показать и уже прочитанные обновления'
                }
              >
                {showRead ? (
                  <EyeOff className="h-4 w-4 mr-1.5" />
                ) : (
                  <Eye className="h-4 w-4 mr-1.5" />
                )}
                {showRead ? 'Скрыть прочитанные' : 'Показать прочитанные'}
              </Button>
              )}
              {unreadProjectIds.size > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => workspaceId && markAllRead.mutate(workspaceId)}
                  disabled={markAllRead.isPending}
                  title="Отметить все обновления прочитанными"
                >
                  <CheckCheck className="h-4 w-4 mr-1.5" />
                  Прочитать всё
                </Button>
              )}
              <Button variant="outline" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing && syncProgress
                  ? `Проверка ${syncProgress.done}/${syncProgress.total}`
                  : 'Проверить источники'}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Файлы из привязанных папок Google Drive по вашим проектам — свежие сверху.
            {!showRead && ' Показаны только непрочитанные.'}
          </p>
        </div>

        {syncing && syncProgress && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${syncPct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Проверено проектов-источников: {syncProgress.done} из {syncProgress.total}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Загрузка…</div>
        ) : days.length === 0 ? (
          !showRead && updates.length > 0 ? (
            /* Файлы есть, но все прочитаны — предлагаем включить прочитанные. */
            <div className="flex flex-col items-center gap-3 py-16 text-center border rounded-lg">
              <CheckCheck className="h-8 w-8 text-muted-foreground/50" />
              <div className="text-sm text-muted-foreground max-w-md">
                Все обновления прочитаны.
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowRead(true)}>
                <Eye className="h-4 w-4 mr-1.5" />
                Показать прочитанные
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center border rounded-lg">
              <FolderSync className="h-8 w-8 text-muted-foreground/50" />
              <div className="text-sm text-muted-foreground max-w-md">
                Пока нет файлов из источников. Привяжите папку Google Drive к проекту или
                набору документов, затем нажмите «Проверить источники».
              </div>
            </div>
          )
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day.dayKey} className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 sticky top-0 bg-background/95 backdrop-blur py-1.5 z-10">
                  {day.label}
                </h2>
                <div className="space-y-4">
                  {day.projects.map((pg) => (
                    <div key={pg.projectId} className="space-y-2">
                      <div className="flex items-center gap-2 px-0.5">
                        <button
                          type="button"
                          onClick={() => openProject(pg.projectId)}
                          className="group/proj flex items-center gap-1.5 text-[15px] font-medium text-foreground/70 hover:text-foreground transition-colors min-w-0"
                        >
                          {unreadProjectIds.has(pg.projectId) && (
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                          )}
                          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                          <span className="truncate max-w-[24rem]">{pg.projectName}</span>
                          <span className="text-muted-foreground/50 text-xs tabular-nums">{pg.count}</span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/proj:opacity-100 transition-opacity" />
                        </button>
                        {unreadProjectIds.has(pg.projectId) && (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(pg.projectId)}
                            disabled={markRead.isPending}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
                            title="Отметить обновления проекта прочитанными"
                          >
                            <Check className="h-3 w-3" />
                            Прочитать
                          </button>
                        )}
                      </div>
                      <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                        <table className="w-full border-collapse table-fixed">
                          {/* Ширины колонок фиксируем здесь: первая строка каждой
                              папки — colSpan-подзаголовок, из которого table-fixed
                              не смог бы вывести ширины. */}
                          <colgroup>
                            <col className="w-8" />
                            <col />
                            <col className="w-[80px]" />
                            <col className="w-[80px]" />
                          </colgroup>
                          <tbody>
                            {pg.folders.map((fg) => (
                              <Fragment key={fg.key}>
                                <tr>
                                  <td colSpan={4} className="pl-8 pr-4 pt-3 pb-1">
                                    <span className="inline-flex items-center gap-1.5 max-w-full text-xs font-medium text-muted-foreground/60">
                                      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45" />
                                      <span className="truncate">{fg.label}</span>
                                      <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                                        {fg.items.length}
                                      </span>
                                    </span>
                                  </td>
                                </tr>
                                {fg.items.map((u, i) => (
                                  <SourceFileRow
                                    key={u.id}
                                    doc={toSourceDoc(u)}
                                    warnMb={null}
                                    dangerMb={null}
                                    draggable={false}
                                    dateDisplay="time"
                                    spacious
                                    striped={(fg.startIndex + i) % 2 === 1}
                                    folderLabel={null}
                                    onToggleHidden={(sourceDocId, hidden) =>
                                      toggleHidden.mutate({ sourceDocId, hidden })
                                    }
                                    togglingHidden={toggleHidden.isPending}
                                  />
                                ))}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkspaceLayout>
  )
}
