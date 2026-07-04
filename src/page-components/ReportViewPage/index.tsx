"use client"

/**
 * Страница одного отчёта: быстрый период → запуск run_report → таблица
 * с группировками/итогами; настройки (группировки/показатели/фильтр/режим),
 * экспорт CSV.
 *
 * Период НЕ сохраняется в отчёте — вклеивается в конфиг на каждый запуск
 * (applyPeriodToConfig), поэтому пресеты «последние 30 дней» скользящие.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2, Lock, Settings2 } from 'lucide-react'
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
import { getDatasetDef, getFieldDef } from '@/lib/reports/registry'
import { applyPeriodToConfig, buildReportCsv } from '@/lib/reports/runtime'
import type { ReportPeriod, ReportPeriodPreset } from '@/types/reports'
import {
  ReportResultTable,
  groupColumns,
  measureColumns,
} from '@/components/reports/ReportResultTable'
import { ReportSettingsDialog } from '@/components/reports/ReportSettingsDialog'

const PERIOD_OPTIONS: { value: ReportPeriodPreset; label: string }[] = [
  { value: 'all', label: 'Всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'last_7', label: '7 дней' },
  { value: 'last_30', label: '30 дней' },
  { value: 'this_month', label: 'Этот месяц' },
  { value: 'last_month', label: 'Прошлый месяц' },
  { value: 'this_year', label: 'Этот год' },
  { value: 'custom', label: 'Период…' },
]

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

  const [period, setPeriod] = useState<ReportPeriod>({ preset: 'all' })
  const [settingsOpen, setSettingsOpen] = useState(false)

  const dataset = getDatasetDef(report?.config.dataset)
  const hasPeriod = !!dataset?.periodField

  const runtimeConfig = useMemo(() => {
    if (!report) return null
    return applyPeriodToConfig(report.config, period)
  }, [report, period])

  const { data: result, isLoading: running, error } = useRunReport(workspaceId, runtimeConfig)
  const updateReport = useUpdateReport(workspaceId)

  const handleExportCsv = () => {
    if (!report || !result || !dataset) return
    let columns: { key: string; label: string }[]
    if (report.config.mode === 'summary') {
      columns = [
        ...groupColumns(report.config, dataset),
        ...measureColumns(report.config, dataset),
      ].map((c) => ({ key: c.alias, label: c.label }))
    } else {
      const keys = report.config.columns && report.config.columns.length > 0
        ? report.config.columns
        : dataset.detailDefault
      columns = keys.map((key) => ({
        key,
        label: getFieldDef(dataset, key)?.label ?? key,
      }))
    }
    const csv = buildReportCsv(columns, result.rows)
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
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {period.preset === 'custom' && (
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    className="h-8 w-[140px]"
                    value={period.from ?? ''}
                    onChange={(e) => setPeriod({ ...period, from: e.target.value })}
                  />
                  <span className="text-muted-foreground text-xs">—</span>
                  <Input
                    type="date"
                    className="h-8 w-[140px]"
                    value={period.to ?? ''}
                    onChange={(e) => setPeriod({ ...period, to: e.target.value })}
                  />
                </div>
              )}
            </div>
          )}

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
            <ReportResultTable config={report.config} result={result} />
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
