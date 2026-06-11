/**
 * Движок шаблона имени папки проекта в Google Drive.
 *
 * Пользователь задаёт в шаблоне проекта строку с переменными вида `{project_name}`,
 * при создании папки они подставляются значениями конкретного проекта. Пустой
 * шаблон → вызывающий код использует старое поведение по умолчанию.
 */

export type FolderNameVars = {
  project_name?: string | null
  description?: string | null
  short_id?: string | null
  template_name?: string | null
  contact_name?: string | null
  /** ISO-дата создания проекта; если нет — берётся текущая. */
  created_at?: string | null
}

/** Доступные переменные для UI (чипы-вставки + подсказка). */
export const FOLDER_NAME_VARIABLES: ReadonlyArray<{ token: string; label: string }> = [
  { token: '{project_name}', label: 'Название проекта' },
  { token: '{contact_name}', label: 'Контакт' },
  { token: '{description}', label: 'Описание' },
  { token: '{short_id}', label: 'Короткий ID' },
  { token: '{template_name}', label: 'Шаблон' },
  { token: '{date}', label: 'Дата (ГГГГ.ММ.ДД)' },
  { token: '{year}', label: 'Год' },
  { token: '{month}', label: 'Месяц' },
  { token: '{day}', label: 'День' },
]

const TOKEN_RE = /\{(project_name|contact_name|description|short_id|template_name|date|year|month|day)\}/g

/**
 * Подставляет переменные в шаблон имени папки.
 * @param replaceSpaces — заменить пробелы в итоговом имени на «_».
 */
export function expandFolderNameTemplate(
  template: string,
  vars: FolderNameVars,
  replaceSpaces: boolean,
): string {
  const d = vars.created_at ? new Date(vars.created_at) : new Date()
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')

  const map: Record<string, string> = {
    '{project_name}': vars.project_name ?? '',
    '{contact_name}': vars.contact_name ?? '',
    '{description}': vars.description ?? '',
    '{short_id}': vars.short_id ?? '',
    '{template_name}': vars.template_name ?? '',
    '{date}': `${yyyy}.${mm}.${dd}`,
    '{year}': yyyy,
    '{month}': mm,
    '{day}': dd,
  }

  let result = template.replace(TOKEN_RE, (m) => map[m] ?? m).trim()
  // Схлопываем пустоты от незаполненных переменных: повторные разделители и пробелы.
  result = result.replace(/\s{2,}/g, ' ')
  if (replaceSpaces) result = result.replace(/\s+/g, '_')
  return result
}
