/**
 * Фабрика query-ключей модуля ВНЖ (residence). Локальная для модуля, чтобы не
 * вводить инверсию lib→hooks. Раньше ключи `['residence', ...]` висели
 * литералами в useResidenceCatalog/mutations (T5 аудита — риск рассинхрона
 * read↔invalidate при расползании).
 */
export const residenceKeys = {
  all: ['residence'] as const,
  countries: () => ['residence', 'countries'] as const,
  currentStatuses: (countryId: string | undefined) =>
    ['residence', 'current-statuses', countryId] as const,
  catalog: (countryId: string | undefined) => ['residence', 'catalog', countryId] as const,
}
