/**
 * InboxReconcileSection — ручная сверка материализованных данных «Входящих».
 *
 * Данные инбокса (счётчики непрочитанного, превью, бейджи) хранятся в
 * предпосчитанных таблицах, которые обновляются триггерами в реальном времени.
 * Эта кнопка запускает полный пересчёт и показывает, сколько расхождений было
 * найдено и исправлено (на здоровой системе — 0). Дополнение к ночной авто-сверке.
 *
 * Доступно только владельцу (RPC отбивает остальных).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { SettingsCard } from './SettingsCard'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

type ReconcileReport = {
  meta_total: number
  meta_fixed: number
  meta_added: number
  meta_removed: number
  unread_total: number
  unread_fixed: number
  unread_added: number
  unread_removed: number
  total_discrepancies: number
}

export function InboxReconcileSection() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<ReconcileReport | null>(null)

  const run = async () => {
    setRunning(true)
    setReport(null)
    try {
      const { data, error } = await supabase.rpc('reconcile_inbox_report')
      if (error) throw error
      const r = data as unknown as ReconcileReport
      setReport(r)
      toast.success(
        r.total_discrepancies === 0
          ? 'Сверка завершена — расхождений нет'
          : `Сверка завершена — найдено и исправлено: ${r.total_discrepancies}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg.includes('владелец') ? 'Сверку может запускать только владелец' : `Ошибка сверки: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <SettingsCard
      title="Сверка данных «Входящих»"
      icon={RefreshCw}
      description={
        <>
          Счётчики непрочитанного, превью и бейджи хранятся в предпосчитанном виде и
          обновляются автоматически в реальном времени (плюс ночная авто-сверка). Эта
          кнопка запускает полный пересчёт вручную и показывает, сколько расхождений
          найдено и исправлено. На здоровой системе — 0. Может занять несколько секунд.
        </>
      }
      padded={false}
    >
      <CardContent>
        <div className="space-y-4">
          <Button type="button" onClick={run} disabled={running} className="gap-2">
            <RefreshCw className={running ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {running ? 'Сверяю…' : 'Запустить сверку'}
          </Button>

          {report && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <div className="font-medium">
                {report.total_discrepancies === 0 ? (
                  <span className="text-emerald-600">Расхождений нет ✓</span>
                ) : (
                  <span className="text-amber-600">
                    Найдено и исправлено расхождений: {report.total_discrepancies}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground">
                <span>Превью/сегменты тредов:</span>
                <span>
                  проверено {report.meta_total}, исправлено {report.meta_fixed + report.meta_added + report.meta_removed}
                </span>
                <span>Счётчики непрочитанного:</span>
                <span>
                  проверено {report.unread_total}, исправлено {report.unread_fixed + report.unread_added + report.unread_removed}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </SettingsCard>
  )
}
