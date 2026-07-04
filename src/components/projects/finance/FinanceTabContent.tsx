/**
 * FinanceTabContent — содержимое вкладки «Финансы» проекта.
 *
 * Раскладка:
 *   1. Чип валюты проекта (если у воркспейса включено >1 валюты)
 *   2. Карточки сводки (стоимость, доходы, расходы, прибыль, остаток)
 *   3. Сетка: слева «Услуги проекта», справа «Доходы» над «Расходами»
 *      (container query finance-tab: >=880px — две колонки, уже — одна).
 *
 * Валюта: одна на весь проект (projects.currency ?? базовая воркспейса),
 * все услуги/доходы/расходы в ней. Курсов и конвертации нет.
 */

import { useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Coins } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import {
  useProjectCurrency,
  useUpdateProjectCurrency,
} from '@/hooks/finance/useCurrencySettings'
import { currencySymbol } from '@/lib/currency'
import { FinanceSummary } from './FinanceSummary'
import { ProjectServicesSection } from './ProjectServicesSection'
import { ProjectTransactionsSection } from './ProjectTransactionsSection'

type Props = {
  projectId: string
  workspaceId: string
}

export function FinanceTabContent({ projectId, workspaceId }: Props) {
  // Push-режим правой панели: на вкладке финансов открытая панель отжимает
  // контент влево, а не накладывается поверх (тот же паттерн, что в
  // TaskListView и DocumentsTabContent — атрибут читает CSS в globals.css).
  // Контент сужается → container query `finance-tab` сам складывает
  // двухколоночную сетку в одну колонку.
  useEffect(() => {
    document.body.setAttribute('data-panel-mode', 'push')
    return () => document.body.removeAttribute('data-panel-mode')
  }, [])

  const { currency, isExplicit, baseCurrency, enabledCurrencies } = useProjectCurrency(
    workspaceId,
    projectId,
  )
  const updateCurrency = useUpdateProjectCurrency(projectId)

  const setCurrency = (code: string) => {
    // Базовая хранится как NULL — наследование: смена базовой воркспейса
    // автоматически подхватится проектами без явной валюты.
    const next = code === baseCurrency ? null : code
    if ((next ?? baseCurrency) === currency && isExplicit === (next != null)) return
    updateCurrency.mutate(next, {
      onError: (e) =>
        toast.error('Не удалось сменить валюту', { description: getUserFacingErrorMessage(e) }),
    })
  }

  const showCurrencyPicker = enabledCurrencies.length > 1 || isExplicit

  return (
    <div className="space-y-8 finance-cq">
      {showCurrencyPicker && (
        <div className="flex justify-end -mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                title="Валюта проекта: все услуги, доходы и расходы проекта в ней"
              >
                <Coins className="h-3.5 w-3.5" />
                Валюта: {currencySymbol(currency)} {currency}
                {!isExplicit && <span className="text-gray-400">(базовая)</span>}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {enabledCurrencies.map((code) => (
                <DropdownMenuItem key={code} onClick={() => setCurrency(code)}>
                  <span className="w-5">{currencySymbol(code)}</span>
                  {code}
                  {code === baseCurrency && (
                    <span className="ml-1 text-xs text-gray-400">базовая</span>
                  )}
                  {code === currency && <span className="ml-auto text-xs">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <FinanceSummary projectId={projectId} currency={currency} />
      <div className="finance-grid grid grid-cols-1 gap-8 items-start">
        <ProjectServicesSection
          projectId={projectId}
          workspaceId={workspaceId}
          currency={currency}
          baseCurrency={baseCurrency}
        />
        <div className="space-y-8">
          <ProjectTransactionsSection
            projectId={projectId}
            workspaceId={workspaceId}
            type="income"
            currency={currency}
          />
          <ProjectTransactionsSection
            projectId={projectId}
            workspaceId={workspaceId}
            type="expense"
            currency={currency}
          />
        </div>
      </div>
    </div>
  )
}
