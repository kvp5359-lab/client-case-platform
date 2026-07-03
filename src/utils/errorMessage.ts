/**
 * Приведение технических ошибок к человекочитаемому русскому тексту.
 *
 * Postgres/Supabase/сетевые ошибки часто несут сырой текст вроде
 * «duplicate key value violates unique constraint …» или английские
 * сообщения из библиотек — их нельзя показывать пользователю-неспециалисту.
 *
 * getUserFacingErrorMessage(error, fallback) возвращает:
 *  - осмысленное русское сообщение для известных технических паттернов;
 *  - исходный текст, если он уже выглядит человеческим (кириллица, короткий);
 *  - fallback в остальных случаях.
 */

function rawMessage(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message
    return typeof m === 'string' ? m : ''
  }
  return ''
}

/** Известные технические паттерны → человеческий текст. Порядок важен. */
const PATTERNS: Array<{ re: RegExp; msg: string }> = [
  { re: /duplicate key|already exists|violates unique/i, msg: 'Такая запись уже существует.' },
  { re: /violates foreign key|violates.*constraint/i, msg: 'Действие нарушает связи данных. Проверьте связанные записи.' },
  { re: /permission denied|not authorized|forbidden|rls|row-level security|42501/i, msg: 'Недостаточно прав для этого действия.' },
  { re: /jwt|token.*expired|invalid.*token|unauthorized/i, msg: 'Сессия истекла. Войдите заново.' },
  { re: /failed to fetch|network|timeout|econn|fetch failed/i, msg: 'Проблема с сетью. Проверьте соединение и повторите.' },
  { re: /not found|does not exist|404/i, msg: 'Запись не найдена или была удалена.' },
  { re: /payload too large|413|file.*too large|exceeds/i, msg: 'Файл слишком большой.' },
]

/** Похоже ли сообщение на «человеческое» (можно показать как есть). */
function looksHuman(msg: string): boolean {
  if (!msg || msg.length > 160) return false
  // Технические маркеры — не показывать
  if (/[{}]|::|\bSELECT\b|\bINSERT\b|\bnull\b|\bundefined\b|constraint|violates|at \w+\.\w+|\[object/i.test(msg)) return false
  // Должна быть кириллица (весь UI русский) и не быть похожей на стектрейс
  return /[а-яё]/i.test(msg)
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback = 'Произошла непредвиденная ошибка. Попробуйте ещё раз.',
): string {
  const raw = rawMessage(error).trim()
  if (!raw) return fallback
  for (const { re, msg } of PATTERNS) {
    if (re.test(raw)) return msg
  }
  if (looksHuman(raw)) return raw
  return fallback
}
