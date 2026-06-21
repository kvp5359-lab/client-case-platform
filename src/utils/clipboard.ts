/**
 * Копирование в буфер обмена с запасным способом.
 *
 * `navigator.clipboard` доступен только в secure context (https/localhost) и
 * может быть заблокирован в iframe без `allow="clipboard-write"`. Когда он
 * недоступен или бросает — откатываемся на устаревший `execCommand('copy')`
 * через временный textarea, который работает в большинстве окружений.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // падаем в fallback ниже
    }
  }

  if (typeof document === 'undefined') return false
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
