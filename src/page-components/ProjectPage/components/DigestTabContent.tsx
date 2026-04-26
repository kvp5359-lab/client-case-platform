"use client"

/**
 * DigestTabContent — вкладка «Дневник проекта».
 *
 * Лента карточек-сводок по дням. Сверху — кнопка «Сделать сводку за сегодня»
 * (или «Обновить», если уже есть). Каждая карточка показывает текст сводки и
 * метаданные (режим: ИИ или авто-список, число событий, время обновления).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Wand2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  todayInMadrid,
  useProjectDigests,
  useGenerateProjectDigest,
  useDeleteProjectDigest,
  type ProjectDigest,
} from '@/hooks/useProjectDigests'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Props {
  projectId: string
  workspaceId: string
}

export function DigestTabContent({ projectId, workspaceId }: Props) {
  const { data: digests = [], isLoading } = useProjectDigests(projectId)
  const generate = useGenerateProjectDigest()
  const remove = useDeleteProjectDigest()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const today = todayInMadrid()
  const [pickedDate, setPickedDate] = useState(today)

  const todayDigest = digests.find(
    (d) => d.period_start === today && d.period_end === today && d.digest_type === 'day',
  )

  const handleGenerate = async (date: string, force: boolean) => {
    try {
      const res = await generate.mutateAsync({
        workspaceId,
        projectId,
        periodStart: date,
        periodEnd: date,
        digestType: 'day',
        force,
      })
      if (res.skipped_reason === 'no_activity') {
        toast.info('За этот день в проекте не было активности — карточка не создана')
      } else if (res.reused) {
        toast.info('Сводка за этот день уже была — показал её')
      } else {
        toast.success('Сводка готова')
      }
    } catch (err) {
      toast.error('Не удалось сгенерировать', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleDelete = async (digest: ProjectDigest) => {
    const ok = await confirm({
      title: 'Удалить карточку?',
      description: `Сводка за ${digest.period_start} будет удалена. Можно будет сгенерировать заново.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await remove.mutateAsync({
        digestId: digest.id,
        projectId,
        workspaceId,
        periodStart: digest.period_start,
      })
      toast.success('Карточка удалена')
    } catch (err) {
      toast.error('Не удалось удалить', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div className="space-y-4 mt-2">
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <div className="text-sm text-gray-700">
            Карточек в дневнике: <b>{digests.length}</b>
          </div>
          <div className="flex-1" />
          <Button
            onClick={() => handleGenerate(today, Boolean(todayDigest))}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : todayDigest ? (
              <RefreshCw className="w-4 h-4 mr-1" />
            ) : (
              <Wand2 className="w-4 h-4 mr-1" />
            )}
            {todayDigest ? 'Обновить за сегодня' : 'Сделать сводку за сегодня'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="digest-pick-date">За другой день</Label>
            <Input
              id="digest-pick-date"
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              max={today}
              className="w-[180px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => handleGenerate(pickedDate, false)}
            disabled={generate.isPending || !pickedDate}
          >
            <Wand2 className="w-4 h-4 mr-1" /> Сделать
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем дневник…
        </div>
      )}

      {!isLoading && digests.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-600">
            Пока ни одной карточки в дневнике. Нажми «Сделать сводку за сегодня» — и здесь
            появится первая.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {digests.map((d) => (
          <DigestCard
            key={d.id}
            digest={d}
            onRefresh={() => handleGenerate(d.period_start, true)}
            onDelete={() => handleDelete(d)}
            isRefreshing={generate.isPending}
          />
        ))}
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}

function DigestCard({
  digest,
  onRefresh,
  onDelete,
  isRefreshing,
}: {
  digest: ProjectDigest
  onRefresh: () => void
  onDelete: () => void
  isRefreshing: boolean
}) {
  const [showRaw, setShowRaw] = useState(false)
  const dateLabel = formatDateLabel(digest.period_start)
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          {dateLabel}
          <span className="text-xs font-normal text-gray-500">
            · {digest.generation_mode === 'llm' ? `ИИ (${digest.model ?? '—'})` : 'авто-список'}
            {' '}· событий: {digest.events_count}
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing} title="Перегенерировать">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} title="Удалить карточку">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="whitespace-pre-wrap text-sm text-gray-800">{digest.content}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-gray-500"
        >
          {showRaw ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          Сырой таймлайн ({Array.isArray(digest.raw_events) ? digest.raw_events.length : 0})
        </Button>
        {showRaw && (
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto max-h-[400px]">
            {JSON.stringify(digest.raw_events, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
}
