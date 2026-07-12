import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Плавающий бейдж даты: при прокрутке показывает текущий день и гаснет в
 * простое (как в Telegram/WhatsApp). Без rAF — обработчик считает по
 * разделителям дат (`[data-sep-day]`, их мало) текущий день: последний
 * разделитель, чей верх уже выше/на уровне верха вьюпорта. setState только
 * при смене дня → лишних ре-рендеров нет даже при частых scroll-событиях.
 *
 * Вынесено из MessageList.tsx (аудит 2026-07-13) — логика не менялась.
 */
export function useFloatingDateBadge(
  scrollAreaRef: RefObject<HTMLDivElement | null>,
  isLoading: boolean,
): { floatingDate: string | null; floatingVisible: boolean } {
  const [floatingDate, setFloatingDate] = useState<string | null>(null)
  const [floatingVisible, setFloatingVisible] = useState(false)
  const floatingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    const update = () => {
      const seps = el.querySelectorAll<HTMLElement>('[data-sep-day]')
      if (!seps.length) return
      const top = el.getBoundingClientRect().top
      let label = seps[0].dataset.sepDay ?? null
      for (const sep of seps) {
        if (sep.getBoundingClientRect().top <= top + 24) label = sep.dataset.sepDay ?? label
        else break
      }
      if (!label) return
      setFloatingDate((prev) => (prev === label ? prev : label))
      setFloatingVisible(true)
      if (floatingHideTimerRef.current) clearTimeout(floatingHideTimerRef.current)
      floatingHideTimerRef.current = setTimeout(() => setFloatingVisible(false), 1800)
    }
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      el.removeEventListener('scroll', update)
      if (floatingHideTimerRef.current) clearTimeout(floatingHideTimerRef.current)
    }
    // Зависимость от isLoading ОБЯЗАТЕЛЬНА: при первой загрузке треда рендерится
    // скелетон (early return в MessageList), и scrollAreaRef.current === null на
    // маунте. Без переподключения после isLoading→false слушатель не повесился бы.
  }, [isLoading, scrollAreaRef])

  return { floatingDate, floatingVisible }
}
