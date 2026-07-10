const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

/**
 * Период сообщения для группировки в галерее (Telegram-стиль):
 * Сегодня / Вчера / «Июнь» (текущий год) / «Май 2025» (прошлые годы).
 * key упорядочивает группы; берётся по дате, поэтому стабилен.
 */
export function periodGroup(iso: string): { key: string; label: string } {
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayMs = 86_400_000
  if (startDay === startToday) return { key: 'today', label: 'Сегодня' }
  if (startDay === startToday - dayMs) return { key: 'yesterday', label: 'Вчера' }
  const sameYear = d.getFullYear() === now.getFullYear()
  const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
  const label = sameYear ? MONTHS_RU[d.getMonth()] : `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`
  return { key, label }
}

/** Русское склонение по числу: pluralRu(2, ['фото','фото','фото']) → 'фото'. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

/** Короткая дата сообщения для результатов поиска: «12 июн, 14:20». */
export function formatMsgDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
