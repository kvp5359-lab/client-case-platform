/**
 * Мобильный вьюпорт (< md = 768px). Совпадает с `@media (max-width: 767px)` и
 * `md:`-брейкпоинтом Tailwind. Не реактивно — читает состояние на момент вызова
 * (для разовых решений: гасить авто-фокус/авто-открытие на мобиле). SSR-safe.
 */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}
