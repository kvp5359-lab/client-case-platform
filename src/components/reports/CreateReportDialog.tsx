"use client"

/**
 * Создание отчёта: название + датасет (+ общий/личный, если есть права
 * на общие). Конфиг берётся из defaultConfig датасета — дальше правится
 * в настройках отчёта.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ReportDatasetKey, ReportDefinition } from '@/types/reports'
import { REPORT_DATASET_LIST, REPORT_DATASETS } from '@/lib/reports/registry'
import { useCreateReport } from '@/hooks/useReports'

type Props = {
  workspaceId: string
  /** Может ли юзер создавать ОБЩИЕ отчёты (владелец/менеджер). */
  canManageShared: boolean
  onClose: () => void
  onCreated: (report: ReportDefinition) => void
}

export function CreateReportDialog({ workspaceId, canManageShared, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [dataset, setDataset] = useState<ReportDatasetKey>('transactions')
  const [personal, setPersonal] = useState(!canManageShared)
  const createReport = useCreateReport()

  const handleCreate = () => {
    const ds = REPORT_DATASETS[dataset]
    createReport.mutate(
      {
        workspaceId,
        name: name.trim() || ds.label,
        personal: canManageShared ? personal : true,
        config: { dataset, ...ds.defaultConfig },
      },
      {
        onSuccess: (report) => onCreated(report),
        onError: (e) => toast.error('Не удалось создать отчёт', { description: String(e) }),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый отчёт</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Оплаты по клиентам"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Данные для отчёта</Label>
            <div className="space-y-1.5">
              {REPORT_DATASET_LIST.map((ds) => (
                <button
                  key={ds.key}
                  type="button"
                  onClick={() => setDataset(ds.key)}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                    dataset === ds.key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="text-sm font-medium">{ds.label}</div>
                  <div className="text-xs text-muted-foreground">{ds.description}</div>
                </button>
              ))}
            </div>
          </div>

          {canManageShared && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={personal}
                onCheckedChange={(v) => setPersonal(v === true)}
              />
              Личный отчёт (виден только мне)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={handleCreate} disabled={createReport.isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
