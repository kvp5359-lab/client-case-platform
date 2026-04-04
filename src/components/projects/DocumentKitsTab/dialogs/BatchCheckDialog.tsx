"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Sparkles } from 'lucide-react'
import { DocumentStatus } from '@/components/documents/types'
import { useBatchCheck } from './useBatchCheck'
import { BatchCheckTable } from './BatchCheckTable'

// Re-export for backwards compatibility
export type { BatchCheckResult } from './useBatchCheck'

interface BatchCheckDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentIds: string[]
  documentNames: Map<string, string>
  statuses: DocumentStatus[]
  onComplete: () => void
}

export function BatchCheckDialog({
  open,
  onOpenChange,
  documentIds,
  documentNames,
  statuses,
  onComplete,
}: BatchCheckDialogProps) {
  const {
    results,
    updateNames,
    setUpdateNames,
    updateStatuses,
    setUpdateStatuses,
    batchStatus,
    setBatchStatus,
    isApplying,
    isChecking,
    checkedCount,
    loadingCount,
    errorCount,
    startBatchCheck,
    handleApply,
    toggleCheck,
    toggleAll,
    updateField,
  } = useBatchCheck({
    open,
    documentIds,
    documentNames,
    onComplete,
    onClose: () => onOpenChange(false),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Пакетная проверка документов
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Чекбоксы настроек */}
          <div className="flex items-center gap-6 px-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="update-names"
                checked={updateNames}
                onCheckedChange={(checked) => setUpdateNames(checked === true)}
              />
              <label
                htmlFor="update-names"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Обновлять названия документов
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="update-statuses"
                checked={updateStatuses}
                onCheckedChange={(checked) => setUpdateStatuses(checked === true)}
              />
              <label
                htmlFor="update-statuses"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Обновлять статусы документов
              </label>
            </div>

            {updateStatuses && (
              <Select value={batchStatus} onValueChange={setBatchStatus}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue placeholder="Выберите статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без статуса</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Статистика и кнопка запуска */}
          <div className="flex items-center justify-between px-1">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Всего: {results.length}</span>
              <span>Выбрано: {checkedCount}</span>
              {loadingCount > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Проверяется: {loadingCount}
                </span>
              )}
              {errorCount > 0 && <span className="text-destructive">Ошибок: {errorCount}</span>}
            </div>
            {!isChecking && results.every((r) => !r.isLoading) && (
              <Button
                onClick={() => startBatchCheck(results)}
                variant="outline"
                size="sm"
                disabled={isChecking}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Запустить проверку
              </Button>
            )}
          </div>

          {/* Таблица с результатами */}
          <BatchCheckTable
            results={results}
            statuses={statuses}
            checkedCount={checkedCount}
            onToggleCheck={toggleCheck}
            onToggleAll={toggleAll}
            onUpdateField={updateField}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying || isChecking}
          >
            Отмена
          </Button>
          <Button onClick={handleApply} disabled={isApplying || isChecking || checkedCount === 0}>
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Применение...
              </>
            ) : (
              `Применить изменения (${checkedCount})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
