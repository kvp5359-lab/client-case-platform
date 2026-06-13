/**
 * Общие типы для MTProto-хендлеров.
 */

/**
 * Контекст активной MTProto-сессии сотрудника, прокидывается во все
 * хендлеры обновлений (incoming/updates/raw). Раньше тип дублировался
 * байт-в-байт в трёх файлах — единый источник, чтобы не разъезжался.
 */
export interface SessionContext {
  user_id: string
  workspace_id: string
  tg_user_id: number
}
