"use client"

/**
 * DigestSettingsTab — раздел «Дневник проекта» в настройках воркспейса.
 *
 * Что даёт:
 *  - редактировать системный промпт, по которому LLM собирает сводки;
 *  - менять порог: при скольких событиях подключать LLM (меньше — простой список без ИИ);
 *  - выбирать модель (отдельно от глобальной модели воркспейса, чтобы можно было дешевле);
 *  - тестовый запуск: выбрать проект и день, прогнать сводку с текущим промптом БЕЗ сохранения.
 *
 * Доступ: только владелец воркспейса.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Loader2, RotateCcw, Wand2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useAccessibleProjects } from '@/hooks/shared/useAccessibleProjects'
import {
  useWorkspaceDigestSettings,
  useUpdateWorkspaceDigestSettings,
} from '@/hooks/useWorkspaceDigestSettings'
import {
  useGenerateProjectDigest,
  todayInMadrid,
  type ProjectDigest,
} from '@/hooks/useProjectDigests'
import { AI_MODELS } from './components/useAISettings'
import { DEFAULT_DIGEST_SYSTEM_PROMPT } from '@/lib/digestDefaults'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MIN_EVENTS = 5

export function DigestSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const isOwner = permissions.isOwner

  const { data: settings, isLoading } = useWorkspaceDigestSettings(workspaceId)
  const update = useUpdateWorkspaceDigestSettings()

  // Локальные оверрайды поверх значений из БД. Так не нужен useEffect для гидрации.
  const [overrides, setOverrides] = useState<{
    systemPrompt?: string
    minEvents?: number
    model?: string
  }>({})

  const systemPrompt = overrides.systemPrompt ?? settings?.system_prompt ?? ''
  const minEvents = overrides.minEvents ?? settings?.min_events_for_llm ?? DEFAULT_MIN_EVENTS
  const model = overrides.model ?? settings?.model ?? DEFAULT_MODEL

  const setSystemPrompt = (v: string) => setOverrides((o) => ({ ...o, systemPrompt: v }))
  const setMinEvents = (v: number) => setOverrides((o) => ({ ...o, minEvents: v }))
  const setModel = (v: string) => setOverrides((o) => ({ ...o, model: v }))

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600">
          Доступ к настройкам Дневника проекта только у владельца воркспейса.
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-gray-600 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Загружаем настройки…
        </CardContent>
      </Card>
    )
  }

  const handleSave = async () => {
    if (!workspaceId) return
    try {
      await update.mutateAsync({
        workspaceId,
        systemPrompt: systemPrompt.trim() ? systemPrompt : null,
        minEventsForLlm: minEvents,
        model,
      })
      setOverrides({}) // после сохранения подсасываем уже сохранённые значения
      toast.success('Настройки Дневника сохранены')
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleFillDefault = () => setSystemPrompt(DEFAULT_DIGEST_SYSTEM_PROMPT)
  const handleResetEmpty = () => setSystemPrompt('')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Промпт сводки</CardTitle>
          <CardDescription>
            Инструкция, по которой ИИ собирает «карточку дня» по проекту. Если оставить пустым —
            используется стандартный (его можно вставить кнопкой ниже и поправить).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Если оставить пустым, будет использоваться стандартный промпт"
            className="min-h-[260px] font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleFillDefault}>
              <Wand2 className="w-4 h-4 mr-1" /> Заполнить стандартным
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleResetEmpty}>
              <RotateCcw className="w-4 h-4 mr-1" /> Очистить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Когда подключать ИИ</CardTitle>
          <CardDescription>
            Если за день в проекте было меньше указанного числа событий, сводка собирается простым
            списком без ИИ — экономит токены, не льёт воду.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Label htmlFor="min-events" className="min-w-[160px]">
              Минимум событий
            </Label>
            <Input
              id="min-events"
              type="number"
              min={1}
              max={100}
              value={minEvents}
              onChange={(e) => setMinEvents(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-24"
            />
            <span className="text-sm text-gray-500">от 1 до 100</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Модель ИИ</CardTitle>
          <CardDescription>
            Какая нейросеть делает сводку. Дороже — обычно качественнее. Если не знаете, что выбрать
            — оставьте Sonnet 4.6.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full max-w-[600px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Сохранить
        </Button>
      </div>

      <TestRunCard
        workspaceId={workspaceId}
        prompt={systemPrompt || DEFAULT_DIGEST_SYSTEM_PROMPT}
      />
    </div>
  )
}

/**
 * Тестовый прогон — выбираем проект и дату, прогоняем сводку с текущим (несохранённым)
 * промптом, ничего не сохраняем в БД, показываем результат прямо здесь.
 */
function TestRunCard({ workspaceId, prompt }: { workspaceId: string | undefined; prompt: string }) {
  const { data: projects = [] } = useAccessibleProjects(workspaceId)
  const generate = useGenerateProjectDigest()
  const [projectId, setProjectId] = useState<string>('')
  const [date, setDate] = useState<string>(todayInMadrid())
  const [result, setResult] = useState<ProjectDigest | null>(null)
  const [skipReason, setSkipReason] = useState<string | null>(null)

  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name })),
    [projects],
  )

  const handleRun = async () => {
    if (!workspaceId || !projectId) {
      toast.error('Выбери проект')
      return
    }
    setResult(null)
    setSkipReason(null)
    try {
      const res = await generate.mutateAsync({
        workspaceId,
        projectId,
        periodStart: date,
        periodEnd: date,
        digestType: 'day',
        testRun: true,
        overridePrompt: prompt,
      })
      if (res.skipped_reason === 'no_activity') {
        setSkipReason('За этот день в проекте не было активности.')
      } else if (res.digest) {
        setResult(res.digest as ProjectDigest)
      }
    } catch (err) {
      toast.error('Не удалось сгенерировать', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Тестовый прогон</CardTitle>
        <CardDescription>
          Прогоняет сводку с текущим (несохранённым) промптом. Результат показывается ниже,
          в Дневник проекта НЕ сохраняется.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="test-project">Проект</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="test-project" className="w-[280px]">
                <SelectValue placeholder="Выбери проект" />
              </SelectTrigger>
              <SelectContent>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="test-date">Дата</Label>
            <Input
              id="test-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button onClick={handleRun} disabled={generate.isPending || !projectId}>
            {generate.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Прогнать
          </Button>
        </div>

        {skipReason && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            {skipReason}
          </div>
        )}

        {result && (
          <div className="rounded-md border bg-gray-50 p-4 space-y-2">
            <div className="text-xs text-gray-500">
              Режим: {result.generation_mode === 'llm' ? `ИИ (${result.model})` : 'авто-список'} ·
              событий: {result.events_count}
            </div>
            <div className="prose prose-sm max-w-none text-gray-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_hr]:my-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
