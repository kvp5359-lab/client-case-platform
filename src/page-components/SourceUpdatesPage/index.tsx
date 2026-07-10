"use client"

/**
 * Страница «Обновления источников» — лента файлов из привязанных источников
 * Google Drive по всему воркспейсу. Группировка «день → проект», свежие сверху.
 * Строки файлов переиспользуют `SourceFileRow` (та же строка, что в лотке набора).
 * Показываются только проекты, к которым у пользователя есть доступ; заголовок
 * проекта кликабелен — переход в проект. Кнопка «Проверить источники»
 * синхронизирует все источники воркспейса.
 */

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FolderSync, RefreshCw, FolderOpen, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import {
  useWorkspaceSourceUpdatesQuery,
  useSyncWorkspaceSourcesMutation,
  useToggleKitSourceHidden,
} from '@/hooks/documents/useSourceDocumentsQuery'
import { SourceFileRow } from '@/components/documents/Documents/SourceFileRow'
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

type ProjectGroup = { projectId: string; projectName: string; items: WorkspaceSourceUpdate[] }
type DayGroup = { dayKey: string; label: string; projects: ProjectGroup[] }

export default function SourceUpdatesPage() {
  usePageTitle('Обновления источников')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  const { data: updates = [], isLoading: updatesLoading } =
    useWorkspaceSourceUpdatesQuery(workspaceId)
  const { data: projects = [], isLoading: projectsLoading } =
    useAccessibleProjects(workspaceId)
  const syncAll = useSyncWorkspaceSourcesMutation()
  const toggleHidden = useToggleKitSourceHidden()

  const accessibleIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects])

  // Группировка «день → проект». Список сортируем по свежести (desc), Map
  // сохраняет порядок первого появления → и дни, и проекты идут по свежести.
  const days = useMemo<DayGroup[]>(() => {
    const sorted = updates
      .filter((u) => accessibleIds.has(u.projectId))
      .map((u) => ({ u, t: updateTime(u) }))
      .filter((x): x is { u: WorkspaceSourceUpdate; t: string } => !!x.t)
      .sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime())

    const dayMap = new Map<string, { label: string; projMap: Map<string, ProjectGroup> }>()
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
        pg = { projectId: u.projectId, projectName: u.projectName || 'Без проекта', items: [] }
        day.projMap.set(u.projectId, pg)
      }
      pg.items.push(u)
    }

    return [...dayMap.entries()].map(([dayKey, day]) => ({
      dayKey,
      label: day.label,
      projects: [...day.projMap.values()],
    }))
  }, [updates, accessibleIds])

  const isLoading = updatesLoading || projectsLoading

  const handleSync = () => {
    if (!workspaceId || syncAll.isPending) return
    syncAll.mutate(workspaceId, {
      onSuccess: (r) => {
        if (r.total === 0) {
          toast.info('Привязанных источников пока нет')
        } else {
          toast.success(
            `Проверено источников: ${r.synced}/${r.total}. Новых файлов найдено: ${r.filesFound}` +
              (r.deleted ? `, убрано: ${r.deleted}` : ''),
          )
        }
      },
    })
  }

  const openProject = (projectId: string) => {
    if (projectId) router.push(`/workspaces/${workspaceId}/projects/${projectId}`)
  }

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Обновления источников</h1>
            <p className="text-sm text-muted-foreground">
              Файлы из привязанных папок Google Drive по вашим проектам — свежие сверху.
            </p>
          </div>
          <Button variant="outline" onClick={handleSync} disabled={syncAll.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncAll.isPending ? 'animate-spin' : ''}`} />
            Проверить источники
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Загрузка…</div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center border rounded-lg">
            <FolderSync className="h-8 w-8 text-muted-foreground/50" />
            <div className="text-sm text-muted-foreground max-w-md">
              Пока нет файлов из источников. Привяжите папку Google Drive к проекту или
              набору документов, затем нажмите «Проверить источники».
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day.dayKey} className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground/80 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                  {day.label}
                </h2>
                <div className="space-y-4">
                  {day.projects.map((pg) => (
                    <div key={pg.projectId} className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => openProject(pg.projectId)}
                        className="group/proj flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[24rem]">{pg.projectName}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground/60 tabular-nums">{pg.items.length}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/proj:opacity-100 transition-opacity" />
                      </button>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full border-collapse table-fixed">
                          <tbody>
                            {pg.items.map((u) => (
                              <SourceFileRow
                                key={u.id}
                                doc={toSourceDoc(u)}
                                warnMb={null}
                                dangerMb={null}
                                draggable={false}
                                dateDisplay="time"
                                folderLabel={u.parentFolderName || u.sourceName || null}
                                onToggleHidden={(sourceDocId, hidden) =>
                                  toggleHidden.mutate({ sourceDocId, hidden })
                                }
                                togglingHidden={toggleHidden.isPending}
                              />
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
