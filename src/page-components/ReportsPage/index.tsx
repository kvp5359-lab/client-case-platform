"use client"

/**
 * Страница «Отчёты» — список сохранённых отчётов воркспейса (общие + личные),
 * создание нового, удаление. Открытие → /workspaces/[id]/reports/[reportId].
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BarChart3, Lock, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useAuth } from '@/contexts/AuthContext'
import { useDeleteReport, useReports } from '@/hooks/useReports'
import { getDatasetDef } from '@/lib/reports/registry'
import type { ReportDefinition } from '@/types/reports'
import { CreateReportDialog } from '@/components/reports/CreateReportDialog'

export default function ReportsPage() {
  usePageTitle('Отчёты')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const { user } = useAuth()

  const { isOwner, can } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canManageShared = isOwner || can('manage_workspace_settings')

  const { data: reports = [], isLoading } = useReports(workspaceId)
  const deleteReport = useDeleteReport(workspaceId)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ReportDefinition | null>(null)

  const canEditReport = (r: ReportDefinition) =>
    r.owner_user_id ? r.owner_user_id === user?.id : canManageShared

  const openReport = (r: ReportDefinition) =>
    router.push(`/workspaces/${workspaceId}/reports/${r.id}`)

  const shared = reports.filter((r) => !r.owner_user_id)
  const personal = reports.filter((r) => !!r.owner_user_id)

  const renderCard = (r: ReportDefinition) => {
    const ds = getDatasetDef(r.config.dataset)
    return (
      <Card
        key={r.id}
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => openReport(r)}
      >
        <CardContent className="p-4 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium truncate">{r.name}</span>
              {r.owner_user_id && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {ds?.label ?? r.config.dataset}
            </div>
          </div>
          {canEditReport(r) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(r)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Отчёты</h1>
            <p className="text-sm text-muted-foreground">
              Сводки по платежам, услугам, долгам, проектам и задачам.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Новый отчёт
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Загрузка…</div>
        ) : reports.length === 0 ? (
          <div className="text-sm text-muted-foreground py-16 text-center border rounded-lg">
            Отчётов пока нет — создай первый: например, «Оплаты по клиентам за месяц».
          </div>
        ) : (
          <div className="space-y-6">
            {shared.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">Общие</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {shared.map(renderCard)}
                </div>
              </div>
            )}
            {personal.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">Мои</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {personal.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {createOpen && workspaceId && (
        <CreateReportDialog
          workspaceId={workspaceId}
          canManageShared={canManageShared}
          onClose={() => setCreateOpen(false)}
          onCreated={(report) => {
            setCreateOpen(false)
            openReport(report)
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить отчёт?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deleteTarget?.name}» будет удалён. Данные, по которым он строился, не пострадают.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return
                deleteReport.mutate(deleteTarget.id, {
                  onSuccess: () => toast.success('Отчёт удалён'),
                  onError: (e) => toast.error('Не удалось удалить', { description: String(e) }),
                })
                setDeleteTarget(null)
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}
