/**
 * Серый префикс названия проекта (из шаблона), как в сайдбаре. Единый рендер
 * для сайдбара (ProjectListItem) и карточки контакта — цвет/формат в одном месте.
 * Возвращает null при пустом префиксе; гейт по настройке (showPrefixes) — на вызывающем.
 */
export function ProjectNamePrefix({ prefix }: { prefix: string | null | undefined }) {
  if (!prefix) return null
  return <span className="text-muted-foreground/70">{prefix} </span>
}
