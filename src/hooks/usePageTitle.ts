import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const APP_NAME = 'ClientCase'

/**
 * Устанавливает title вкладки браузера в формате `<title> — ClientCase`.
 *
 * Пустое значение игнорируется (не затираем title, пока данные грузятся).
 * Cleanup намеренно отсутствует: при навигации следующая страница сама
 * выставит свой title, а восстановление старого значения на unmount
 * приводило к тому, что закрытая страница затирала title новой.
 *
 * Зависим от `pathname` и `searchParams`: при навигации внутри одной страницы
 * (router.replace c новым query) Next.js пересчитывает metadata и затирает
 * document.title дефолтным значением из layout — нужно перевыставить наш.
 */
export function usePageTitle(title: string | null | undefined) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!title) return
    document.title = `${title} — ${APP_NAME}`
  }, [title, pathname, searchParams])
}
