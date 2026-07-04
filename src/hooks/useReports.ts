"use client"

/**
 * Хуки системы отчётов: CRUD report_definitions + запуск run_report.
 *
 * Запуск (useRunReport) кэшируется по hash итогового конфига (вместе с
 * вклеенным периодом) — смена периода/настроек даёт новый ключ, повторное
 * открытие того же среза берётся из кэша (staleTime 30с).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { ReportConfig } from '@/types/reports'
import type { ReportOptionsKind } from '@/lib/reports/registry'
import {
  createReport,
  getReportById,
  getReportFieldOptions,
  getReports,
  runReport,
  softDeleteReport,
  updateReport,
  type CreateReportParams,
  type UpdateReportParams,
} from '@/services/reportService'

export function useReports(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? reportKeys.byWorkspace(workspaceId) : ['reports', 'noop'],
    enabled: !!workspaceId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: () => getReports(workspaceId!),
  })
}

export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: reportId ? reportKeys.byId(reportId) : ['reports', 'byId', 'noop'],
    enabled: !!reportId,
    staleTime: STALE_TIME.STANDARD,
    queryFn: () => getReportById(reportId!),
  })
}

export function useCreateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateReportParams) => createReport(params),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: reportKeys.byWorkspace(report.workspace_id) })
    },
  })
}

export function useUpdateReport(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: UpdateReportParams) => updateReport(params),
    onSuccess: (_res, params) => {
      qc.invalidateQueries({ queryKey: reportKeys.byId(params.reportId) })
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: reportKeys.byWorkspace(workspaceId) })
      }
    },
  })
}

export function useDeleteReport(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reportId: string) => softDeleteReport(reportId),
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: reportKeys.byWorkspace(workspaceId) })
      }
    },
  })
}

/**
 * Запуск отчёта. config=null → запрос выключен (нет конфига/датасета).
 * Конфиг должен быть УЖЕ итоговым (с вклеенным периодом — applyPeriodToConfig).
 */
export function useRunReport(workspaceId: string | undefined, config: ReportConfig | null) {
  const hash = config ? JSON.stringify(config) : ''
  return useQuery({
    queryKey:
      workspaceId && config ? reportKeys.run(workspaceId, hash) : ['reports', 'run', 'noop'],
    enabled: !!workspaceId && !!config,
    staleTime: 30_000,
    queryFn: () => runReport(workspaceId!, config!),
  })
}

/** Варианты значений для uuid-полей фильтра (справочники по optionsKind). */
export function useReportFieldOptions(
  workspaceId: string | undefined,
  kind: ReportOptionsKind | null,
) {
  return useQuery({
    queryKey:
      workspaceId && kind
        ? reportKeys.fieldOptions(workspaceId, kind)
        : ['reports', 'field-options', 'noop'],
    enabled: !!workspaceId && !!kind,
    staleTime: STALE_TIME.STANDARD,
    queryFn: () => getReportFieldOptions(workspaceId!, kind!),
  })
}
