import { useEffect, type RefObject } from 'react'

/**
 * Пишет текущее время ("ЧЧ:ММ") в CSS-переменную --rbc-now-label на
 * переданном контейнере. CSS-правило .rbc-current-time-indicator::after
 * (globals.css) рисует эту подпись у красной линии-индикатора
 * react-big-calendar.
 *
 * Обновление — раз в минуту, выровнено по границе минуты. Меняется только
 * одна CSS-переменная, ре-рендера календаря/React нет. Нагрузка нулевая.
 */
export function useNowIndicatorLabel(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const update = () => {
      const el = ref.current
      if (!el) return
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      el.style.setProperty('--rbc-now-label', `"${hh}:${mm}"`)
    }

    update()

    // Выравниваем первый тик на ближайшую границу минуты, дальше — раз в минуту.
    const now = new Date()
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    let interval: ReturnType<typeof setInterval> | undefined
    const timeout = setTimeout(() => {
      update()
      interval = setInterval(update, 60_000)
    }, msToNextMinute)

    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [ref])
}
