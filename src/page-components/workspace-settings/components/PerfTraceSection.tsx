/**
 * PerfTraceSection — переключатель диагностики производительности мессенджера.
 *
 * Личная настройка (хранится в localStorage этого браузера, не в БД) — включает
 * трассировщик таймингов открытия тредов во «Входящих». Когда включено, в
 * консоли браузера (F12 → Console) по каждому открытию треда печатается таблица
 * этапов с временами. Подробности — src/utils/perfTrace.ts.
 *
 * Задумано как «постепенно обрастающий» блок: сюда добавляются новые тумблеры
 * под отдельные замеры по мере необходимости.
 */

import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Gauge } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { SettingsCard } from './SettingsCard'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { isPerfTraceEnabled, setPerfTraceEnabled, subscribePerfTrace } from '@/utils/perfTrace'

export function PerfTraceSection() {
  // Источник правды — localStorage; читаем через useSyncExternalStore
  // (SSR-безопасно: на сервере getServerSnapshot возвращает false).
  const enabled = useSyncExternalStore(subscribePerfTrace, isPerfTraceEnabled, () => false)

  const toggle = (on: boolean) => {
    setPerfTraceEnabled(on)
    toast.success(
      on
        ? 'Замеры включены. Открой консоль (F12) и пооткрывай треды во «Входящих».'
        : 'Замеры выключены',
    )
  }

  const getPerf = () =>
    (typeof window !== 'undefined'
      ? (window as unknown as { __ccPerf?: { dump: () => unknown; clear: () => void } }).__ccPerf
      : undefined)

  return (
    <SettingsCard
      title="Диагностика производительности"
      description="Замер таймингов открытия тредов во «Входящих». Когда включено, по каждому открытию чата в консоли браузера (F12 → вкладка Console) печатается таблица этапов: клик → загрузка из сети → отрисовка, с временем каждого шага в миллисекундах. Настройка личная — действует только в этом браузере. Когда выключено — на скорость не влияет."
      icon={Gauge}
      padded={false}
    >
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border px-3 py-3">
            <Label htmlFor="perf-trace-switch" className="cursor-pointer">
              Включить замеры таймингов
            </Label>
            <Switch id="perf-trace-switch" checked={enabled} onCheckedChange={toggle} />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!enabled}
              onClick={() => {
                getPerf()?.dump()
                toast.success('Таблица выгружена в консоль (F12)')
              }}
            >
              Выгрузить логи в консоль
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!enabled}
              onClick={() => {
                getPerf()?.clear()
                toast.success('История замеров очищена')
              }}
            >
              Очистить историю
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Как снять данные: включи тумблер → открой консоль браузера (F12 →
            Console) → пооткрывай треды, особенно те, что «думают» долго → скопируй
            таблицы <code>⏱ perf …</code> и пришли их.
          </p>
        </div>
      </CardContent>
    </SettingsCard>
  )
}
