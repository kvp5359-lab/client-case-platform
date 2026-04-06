/**
 * Константы и утилиты валидации загрузки файлов
 *
 * Единый источник правды для всех мест, где валидируются загружаемые файлы.
 * Лимит 50 МБ — ограничение Supabase Storage.
 */

/** Максимальный размер загружаемого файла (50 МБ — лимит Supabase Storage) */
export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024

/** Допустимые MIME-типы для загрузки документов */
export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
])

/** Допустимые расширения файлов (без точки) */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'])

/**
 * MIME-типы файлов, поддерживаемых для автозаполнения форм (AI-анализ)
 * Включает image/jpg наряду с image/jpeg, чтобы не было расхождений
 */
export const AUTOFILL_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]

/**
 * Валидирует файл по размеру и типу.
 * @returns Текст ошибки или null если файл валиден
 */
export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE) {
    return `${file.name}: размер (${Math.round(file.size / 1024 / 1024)} МБ) превышает лимит 50 МБ`
  }

  if (file.type) {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
      return `${file.name}: тип файла не поддерживается (${file.type})`
    }
  } else {
    // MIME-type пустой — проверяем по расширению
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return `${file.name}: тип файла не поддерживается`
    }
  }

  return null
}
