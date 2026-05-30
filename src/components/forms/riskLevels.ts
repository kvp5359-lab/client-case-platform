/**
 * Риск-оценка отдельного поля анкеты (🟢🟡🔴).
 *
 * Флаг «поле поддерживает оценку» включается в шаблоне (form_template_fields.risk_assessment_enabled),
 * сама оценка хранится рядом с ответом (form_kit_field_values.risk_level).
 * Ставит и видит только сотрудник; клиенту механика не показывается.
 */

export const RISK_LEVELS = ['green', 'yellow', 'red'] as const

export type RiskLevel = (typeof RISK_LEVELS)[number]

/** Насыщенные цвета — риск должен бросаться в глаза (в отличие от пастельных секций). */
export const RISK_COLORS: Record<RiskLevel, string> = {
  green: '#22C55E', // green-500
  yellow: '#F59E0B', // amber-500
  red: '#EF4444', // red-500
}

/** Бледно-серая полоса у поля, где оценка включена, но ещё не проставлена. */
export const RISK_UNSET_COLOR = '#D1D5DB' // gray-300

export const RISK_LABELS: Record<RiskLevel, string> = {
  green: 'Низкий риск',
  yellow: 'Средний риск',
  red: 'Высокий риск',
}

export function isRiskLevel(value: string | null | undefined): value is RiskLevel {
  return value === 'green' || value === 'yellow' || value === 'red'
}
