/**
 * Query keys системы отчётов (report_definitions + run_report).
 */

export const reportKeys = {
  all: ['reports'] as const,
  byWorkspace: (workspaceId: string) => ['reports', 'list', workspaceId] as const,
  byId: (reportId: string) => ['reports', 'byId', reportId] as const,
  /** Запуск отчёта: hash — JSON.stringify итогового конфига (с периодом). */
  run: (workspaceId: string, hash: string) => ['reports', 'run', workspaceId, hash] as const,
  fieldOptions: (workspaceId: string, kind: string) =>
    ['reports', 'field-options', workspaceId, kind] as const,
}
