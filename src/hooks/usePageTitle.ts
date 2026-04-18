import { useEffect } from 'react'

const APP_NAME = 'ClientCase'

/**
 * Устанавливает title вкладки браузера в формате `<title> — ClientCase`.
 *
 * Пустое значение игнорируется (не затираем title, пока данные грузятся).
 * Cleanup намеренно отсутствует: при навигации следующая страница сама
 * выставит свой title, а восстановление старого значения на unmount
 * приводило к тому, что закрытая страница затирала title новой.
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!title) return
    document.title = `${title} — ${APP_NAME}`
  }, [title])
}
