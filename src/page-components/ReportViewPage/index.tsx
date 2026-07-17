"use client"

/**
 * Страница одного отчёта: быстрый период → запуск run_report → таблица
 * (дерево групп с подытогами / список записей); настройки, экспорт CSV.
 *
 * Конфиг из БД сначала нормализуется (legacy-режимы «сводка/список» → единая
 * модель), затем в него вклеивается период — он НЕ сохраняется в отчёте,
 * поэтому пресеты «последние 30 дней» скользящие.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Lock, RefreshCw, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useReport, useRunReport, useUpdateReport } from '@/hooks/useReports'
import { getDatasetDef } from '@/lib/reports/registry'
import {
  applyPeriodToConfig,
  buildReportCsv,
  csvColumns,
  extractPeriodFromConfig,
  leafRows,
  normalizeReportConfig,
  PERIOD_PRESET_OPTIONS,
  resolveDynamicPeriods,
  resolvePeriodRange,
  stripPeriodConditions,
} from '@/lib/reports/runtime'
import type { ReportPeriod, ReportPeriodPreset } from '@/types/reports'
import { ReportResultTable } from '@/components/reports/ReportResultTable'
import { ReportSettingsDialog } from '@/components/reports/ReportSettingsDialog'

export default function ReportViewPage() {
  const { workspaceId, reportId } = useParams<{ workspaceId: string; reportId: string }>()
  const router = useRouter()
  const { user } = useAuth()

  const { data: report, isLoading: loadingReport } = useReport(reportId)
  usePageTitle(report?.name ?? 'Отчёт')

  const { isOwner, can } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canEdit = report
    ? report.owner_user_id
      ? report.owner_user_id === user?.id
      : isOwner || can('manage_workspace_settings')
    : false

  /**
   * Быстрый период. Отчёт грузится асинхронно, а стартовое значение зависит
   * от него (период, зашитый в фильтр отчёта, должен быть виден в селекте) —
   * поэтому пользовательский выбор храним вместе с id отчёта и до первого
   * выбора берём период из конфига (adjust-on-prop-change, без эффекта).
   */
  const [periodChoice, setPeriodChoice] = useState<{ reportId: string; period: ReportPeriod } | null>(null)
  const period = useMemo<ReportPeriod>(() => {
    if (periodChoice && periodChoice.reportId === report?.id) return periodChoice.period
    return (report && extractPeriodFromConfig(report.config)) || { preset: 'all' }
  }, [periodChoice, report])
  const setPeriod = (p: ReportPeriod) => {
    if (report) setPeriodChoice({ reportId: report.id, period: p })
  }

  const [settingsOpen, setSettingsOpen] = useState(false)
  /**
   * Счётчик «Обновить»: динамические даты («сегодня», «этот месяц») считаются
   * при сборке runtimeConfig, поэтому кнопка обязана пересобрать конфиг — на
   * вкладке, открытой со вчера, один refetch оставил бы вчерашние даты.
   */
  const [runNonce, setRunNonce] = useState(0)

  const dataset = getDatasetDef(report?.config.dataset)
  const hasPeriod = !!dataset?.periodField

  // Реальные границы выбранного пресета — пользователь видит даты, а не
  // только название вроде «Этот месяц».
  const periodRange = useMemo(() => resolvePeriodRange(period), [period])

  /**
   * Порядок сборки: период из фильтра отчёта — только дефолт быстрого выбора,
   * поэтому сперва он ВЫРЕЗАЕТСЯ (stripPeriodConditions — иначе «этот месяц»
   * из фильтра ∧ «прошлый месяц» со страницы = пусто), затем разворачиваются
   * остальные «период»-условия (dyn_period по другим датам — сервер их не
   * понимает), и только потом вклеивается выбранный период.
   */
  const runtimeConfig = useMemo(() => {
    if (!report) return null
    return applyPeriodToConfig(
      resolveDynamicPeriods(stripPeriodConditions(normalizeReportConfig(report.config))),
      period,
    )
    // runNonce в deps намеренно: пересчёт «сегодняшних» дат по кнопке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, period, runNonce])

  /**
   * Сменились даты → новый ключ запроса, useRunReport сам сходит за данными;
   * refetch покрывает обратный случай (даты те же — ключ не изменился).
   */
  const handleRefresh = () => {
    setRunNonce((n) => n + 1)
    refetch()
  }

  const {
    data: result,
    isLoading: running,
    isFetching: refreshing,
    error,
    refetch,
  } = useRunReport(workspaceId, runtimeConfig)
  const updateReport = useUpdateReport(workspaceId)

  /**
   * CSV: у дерева выгружаем листовой уровень (группы + агрегаты) — записи
   * внутри групп догружаются лениво, целиком их на клиенте нет. Ключи колонок
   * для этих строк отличаются от табличных — их знает csvColumns.
   */
  const handleExportCsv = () => {
    if (!report || !result || !dataset || !runtimeConfig) return
    const columns = csvColumns(runtimeConfig, dataset)
    const rows =
      runtimeConfig.groupBy.length > 0 ? leafRows(result.rows, runtimeConfig) : result.rows
    const csv = buildReportCsv(columns, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loadingReport) {
    return (
      <WorkspaceLayout>
        <div className="p-6 flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </WorkspaceLayout>
    )
  }

  if (!report) {
    return (
      <WorkspaceLayout>
        <div className="p-6 text-center py-24 text-sm text-muted-foreground">
          Отчёт не найден или удалён.
          <div className="mt-3">
            <Button variant="outline" onClick={() => router.push(`/workspaces/${workspaceId}/reports`)}>
              К списку отчётов
            </Button>
          </div>
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/workspaces/${workspaceId}/reports`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold truncate flex items-center gap-1.5">
              {report.name}
              {report.owner_user_id && (
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </h1>
            <div className="text-xs text-muted-foreground">{dataset?.label}</div>
          </div>

          {hasPeriod && (
            <div className="flex items-center gap-2">
              <Select
                value={period.preset}
                onValueChange={(v) =>
                  setPeriod({ preset: v as ReportPeriodPreset })
                }
              >
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESET_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Реальные границы пресета — всегда видимы и редактируемы:
                  правка даты руками переводит период в «Период…». */}
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={periodRange?.from ?? ''}
                  onChange={(e) =>
                    setPeriod({ preset: 'custom', from: e.target.value, to: periodRange?.to ?? '' })
                  }
                />
                <span className="text-muted-foreground text-xs">—</span>
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={periodRange?.to ?? ''}
                  onChange={(e) =>
                    setPeriod({ preset: 'custom', from: periodRange?.from ?? '', to: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            title="Обновить отчёт"
            onClick={handleRefresh}
            disabled={refreshing || !runtimeConfig}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!result || result.rows.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" />
              Настроить
            </Button>
          )}
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Не удалось построить отчёт: {String((error as Error).message ?? error)}
          </div>
        ) : running || !result ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {result.limitHit && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Показаны первые {result.rowCount} строк — сузь период или добавь фильтр.
              </div>
            )}
            {runtimeConfig && workspaceId && (
              <ReportResultTable
                config={runtimeConfig}
                result={result}
                workspaceId={workspaceId}
              />
            )}
          </>
        )}
      </div>

      {settingsOpen && workspaceId && (
        <ReportSettingsDialog
          workspaceId={workspaceId}
          report={report}
          saving={updateReport.isPending}
          onClose={() => setSettingsOpen(false)}
          onSave={(name, config) => {
            updateReport.mutate(
              { reportId: report.id, name, config },
              {
                onSuccess: () => {
                  setSettingsOpen(false)
                  toast.success('Отчёт сохранён')
                },
                onError: (e) =>
                  toast.error('Не удалось сохранить', { description: String(e) }),
              },
            )
          }}
        />
      )}
    </WorkspaceLayout>
  )
}
