/**
 * Валюты финансового модуля.
 *
 * Модель (уровень «базовая + валюта проекта», без конвертации):
 *  - workspaces.base_currency      — базовая валюта воркспейса;
 *  - workspaces.enabled_currencies — список валют, с которыми работаем;
 *  - projects.currency             — валюта проекта (NULL = базовая).
 * Все суммы внутри проекта — в его валюте. Курсов и пересчёта нет:
 * валюта — только разметка отображения.
 */

export const DEFAULT_CURRENCY = 'EUR'

/** Валюты, предлагаемые в настройках (можно расширять). */
export const CURRENCY_OPTIONS: { code: string; label: string }[] = [
  { code: 'EUR', label: 'Евро' },
  { code: 'USD', label: 'Доллар США' },
  { code: 'GBP', label: 'Фунт стерлингов' },
  { code: 'CHF', label: 'Швейцарский франк' },
  { code: 'PLN', label: 'Польский злотый' },
  { code: 'CZK', label: 'Чешская крона' },
  { code: 'TRY', label: 'Турецкая лира' },
  { code: 'AED', label: 'Дирхам ОАЭ' },
  { code: 'ILS', label: 'Новый шекель' },
  { code: 'RUB', label: 'Российский рубль' },
  { code: 'UAH', label: 'Украинская гривна' },
  { code: 'KZT', label: 'Казахстанский тенге' },
  { code: 'GEL', label: 'Грузинский лари' },
  { code: 'RSD', label: 'Сербский динар' },
]

const symbolCache = new Map<string, string>()

/** Символ валюты («€», «$», «₽»…). Для неизвестных кодов — сам код. */
export function currencySymbol(code: string): string {
  const cached = symbolCache.get(code)
  if (cached) return cached
  let symbol = code
  try {
    const part = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')
    if (part?.value) symbol = part.value
  } catch {
    // невалидный код — оставляем как есть
  }
  symbolCache.set(code, symbol)
  return symbol
}

/** «1 192,00 €» — сумма с символом валюты (ru-RU: символ после числа). */
export function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // невалидный код валюты — число + код
    return `${new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)} ${currency}`
  }
}

/** «1 192,00» — число без символа (для мест, где символ в подписи колонки). */
export function formatAmount(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Итоги в разрезе валют: «1 200,00 € + 500,00 $».
 * Для общего журнала, где проекты могут быть в разных валютах.
 */
export function formatMoneyByCurrency(sums: Map<string, number>): string {
  const parts: string[] = []
  for (const [code, value] of sums) {
    if (value === 0 && sums.size > 1) continue
    parts.push(formatMoney(value, code))
  }
  return parts.length > 0 ? parts.join(' + ') : formatMoney(0, DEFAULT_CURRENCY)
}
