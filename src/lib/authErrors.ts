/**
 * Маппер ошибок Supabase Auth → дружелюбный русский текст.
 * Используется во всех формах входа/регистрации, чтобы не показывать
 * сырые английские сообщения вроде "User is banned".
 */

import type { AuthError } from '@supabase/supabase-js'

export function formatAuthError(error: AuthError | Error | null | undefined): string {
  if (!error) return ''
  const raw = error.message ?? ''
  const lower = raw.toLowerCase()

  // Юзер забанен (banned_until в auth.users) — наш сценарий блокировки участника.
  if (lower.includes('user is banned') || lower.includes('user_banned')) {
    return 'Вход невозможен. У администратора может быть больше информации.'
  }

  // Возвращаем сырое сообщение, если не знаем как обработать — фронт сам
  // покажет его в Alert'е. Сюда можно добавлять переводы других кодов по мере
  // появления (invalid_credentials, otp_expired и т.п.).
  return raw
}
