"use client"

/**
 * WorkspaceDigestsPage — «Сводки» по всему воркспейсу.
 *
 * Идея: выбрал дату → видишь карточки дневника по всем проектам, в которых что-то было.
 * Если карточек нет — есть кнопка «Собрать сводку по всем», которая в цикле зовёт
 * generate-project-digest по каждому проекту с активностью (с параллелизмом 2).
 *
 * Рядом — кнопка «Обновить» которая перегенерирует уже существующие.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, Wand2, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { shortenModel } from '@/lib/digestDefaults'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useSidePanelStore } from '@/store/sidePanelStore'
import {
  todayInMadrid,
  useProjectsWithActivity,
  useWorkspaceDigestsForDate,
  useGenerateProjectDigest,
  type ProjectWithActivity,
  type ProjectDigest,
} from '@/hooks/useProjectDigests'

const CONCURRENCY = 2

export default function WorkspaceDigestsPage() {
  usePageTitle('Сводки')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const closePanel = useSidePanelStore((s) => s.closePanel)
  useEffect(() => { closePanel() }, [closePanel])

  const [date, setDate] = useState(todayInMadrid())

  const { data: activeProjects = [], isLoading: loadingProjects } = useProjectsWithActivity(
    workspaceId, date, date,
  )
  const { data: digests = [], isLoading: loadingDigests } = useWorkspaceDigestsForDate(
    workspaceId, date,
  )

  const generate = useGenerateProjectDigest()

  // Прогресс пакетной генерации.
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [batchRunning, setBatchRunning] = useState(false)

  const projectsWithoutDigest = useMemo(
    () => activeProjects.filter((p) => !p.has_digest),
    [activeProjects],
  )

  const runBatch = async (
    targets: ProjectWithActivity[],
    options: { force: boolean; label: string },
  ) => {
    if (!workspaceId || targets.length === 0) return
    setBatchTotal(targets.length)
    setBatchDone(0)
    setBatchRunning(true)
    let success = 0
    let failed = 0
    try {
      const queue = [...targets]
      const workers = new Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) break
          try {
            await generate.mutateAsync({
              workspaceId,
              projectId: item.project_id,
              periodStart: date,
              periodEnd: date,
              digestType: 'day',
              force: options.force,
            })
            success++
          } catch (err) {
            failed++
            console.error('Digest failed for project', item.project_id, err)
          } finally {
            setBatchDone((d) => d + 1)
          }
        }
      })
      await Promise.all(workers)
      toast.success(`${options.label}: готово ${success} из ${targets.length}`, {
        description: failed > 0 ? `Не удалось: ${failed}` : undefined,
      })
    } finally {
      setBatchRunning(false)
    }
  }

  if (!workspaceId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-auto bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          <div>
            <h1 className="text-xl font-semibold">Сводки по проектам</h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Дневник по всему воркспейсу: выбери дату, посмотри что было в каждом проекте.
            </p>
          </div>

          {/* Компактная панель управления — без фоновых плашек */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className="text-gray-500">Дата:</span>
            <Input
              id="ws-digest-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-[150px]"
            />
            <span className="text-gray-300">·</span>
            <span>
              Проектов с активностью: <b>{activeProjects.length}</b>
              {activeProjects.length > 0 && (
                <span className="text-gray-500">
                  {' '}· сводок готово: {activeProjects.filter((p) => p.has_digest).length}
                </span>
              )}
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              disabled={batchRunning || loadingProjects || projectsWithoutDigest.length === 0}
              onClick={() => runBatch(projectsWithoutDigest, { force: false, label: 'Сборка сводок' })}
            >
              {batchRunning ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 mr-1" />
              )}
              Собрать ({projectsWithoutDigest.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={batchRunning || activeProjects.length === 0}
              onClick={() => runBatch(activeProjects, { force: true, label: 'Перегенерация' })}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Перегенерировать все
            </Button>
          </div>

          {batchRunning && (
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Готово {batchDone} из {batchTotal}
              </div>
              <div className="h-1.5 bg-gray-200 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{
                    width: batchTotal ? `${(batchDone / batchTotal) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          )}

          {(loadingProjects || loadingDigests) && (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Загружаем…
            </div>
          )}

          {digests.length === 0 && !loadingDigests && (
            <div className="text-sm text-gray-500 py-6 text-center">
              {activeProjects.length === 0
                ? 'В этот день в проектах ничего не происходило.'
                : 'Сводки на эту дату ещё не собраны. Нажми «Собрать» выше.'}
            </div>
          )}

          <div className="space-y-3">
            {digests.map((d) => (
              <DigestRow
                key={d.id}
                digest={d}
                onOpenProject={() => router.push(`/workspaces/${workspaceId}/projects/${d.project_id}`)}
              />
            ))}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  )
}

function DigestRow({
  digest,
  onOpenProject,
}: {
  digest: ProjectDigest & { project: { id: string; name: string } | null }
  onOpenProject: () => void
}) {
  const modeLabel = digest.generation_mode === 'llm'
    ? `ИИ · ${shortenModel(digest.model)}`
    : 'авто-список'
  return (
    <Card>
      <CardHeader className="px-4 py-2.5 flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
          <span className="truncate">{digest.project?.name ?? 'Проект'}</span>
          <span
            className="text-xs font-normal text-gray-500 whitespace-nowrap"
            title={digest.generation_mode === 'llm' && digest.model ? digest.model : undefined}
          >
            · {modeLabel} · событий: {digest.events_count}
          </span>
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onOpenProject}>
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Открыть
        </Button>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-3">
        <div className="prose prose-sm max-w-none text-gray-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-sm [&_hr]:my-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{digest.content}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  )
}

