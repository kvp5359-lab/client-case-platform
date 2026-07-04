/**
 * CurrencySettingsSection — валюты воркспейса (Настройки → Общие).
 *
 * Список включённых валют (с которыми работаем) + базовая. Валюта — только
 * разметка отображения: суммы хранятся числами, конвертации и курсов нет.
 * У проекта можно выбрать свою валюту из включённых (чип на вкладке Финансы);
 * без явного выбора проект наследует базовую.
 */

import { toast } from 'sonner'
import { Coins } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { SettingsCard } from './SettingsCard'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useWorkspaceCurrency,
  useUpdateWorkspaceCurrency,
} from '@/hooks/finance/useCurrencySettings'
import { CURRENCY_OPTIONS, currencySymbol } from '@/lib/currency'

type Props = { workspaceId: string }

export function CurrencySettingsSection({ workspaceId }: Props) {
  const { baseCurrency, enabledCurrencies } = useWorkspaceCurrency(workspaceId)
  const updateMutation = useUpdateWorkspaceCurrency(workspaceId)

  const save = (next: { baseCurrency: string; enabledCurrencies: string[] }) => {
    updateMutation.mutate(next, {
      onSuccess: () => toast.success('Настройки валют сохранены'),
      onError: () => toast.error('Не удалось сохранить настройки валют'),
    })
  }

  const toggleCurrency = (code: string) => {
    if (code === baseCurrency) return // базовую выключить нельзя
    const next = enabledCurrencies.includes(code)
      ? enabledCurrencies.filter((c) => c !== code)
      : [...enabledCurrencies, code]
    save({ baseCurrency, enabledCurrencies: next })
  }

  const setBase = (code: string) => {
    // Базовая обязана быть включённой.
    const next = enabledCurrencies.includes(code)
      ? enabledCurrencies
      : [...enabledCurrencies, code]
    save({ baseCurrency: code, enabledCurrencies: next })
  }

  return (
    <SettingsCard
      title="Валюты"
      description="С какими валютами работает воркспейс и какая из них базовая. Валюта — только отображение: суммы не конвертируются, курсов нет. У проекта можно выбрать свою валюту (по умолчанию — базовая)."
      icon={Coins}
      padded={false}
    >
      <CardContent>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Базовая валюта</Label>
            <div className="max-w-xs">
              <Select value={baseCurrency} onValueChange={setBase}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.code} value={o.code}>
                      {currencySymbol(o.code)} {o.code} — {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500">
              Используется по умолчанию во всех проектах и справочнике услуг.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Включённые валюты</Label>
            <p className="text-xs text-gray-500">
              Их можно выбирать как валюту проекта. Базовая включена всегда.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CURRENCY_OPTIONS.map((o) => {
                const enabled = enabledCurrencies.includes(o.code)
                const isBase = o.code === baseCurrency
                return (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => toggleCurrency(o.code)}
                    disabled={isBase || updateMutation.isPending}
                    title={isBase ? 'Базовая валюта включена всегда' : o.label}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      enabled
                        ? 'bg-brand-100 text-brand-800 hover:bg-brand-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'
                    } ${isBase ? 'ring-1 ring-brand-400 cursor-default' : ''}`}
                  >
                    <span>{currencySymbol(o.code)}</span>
                    <span>{o.code}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </SettingsCard>
  )
}
