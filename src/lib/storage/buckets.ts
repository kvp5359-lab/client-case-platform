/**
 * Имена бакетов хранилища — БЕЗ зависимости от supabase-клиента.
 *
 * Вынесено отдельно, чтобы серверный код (Next API routes) мог импортировать
 * константы, не подтягивая браузерный singleton из `./index.ts`.
 * Строковые литералы бакетов в коде запрещены — только эти константы.
 */
export const STORAGE_BUCKETS = {
  /** Вложения сообщений + документы проектов (основной бакет). */
  files: 'files',
  /** Легаси-бакет документов проектов. */
  documentFiles: 'document-files',
  /** Шаблоны документов. */
  documentTemplates: 'document-templates',
  /** Вложения мессенджера (часть путей). */
  messageAttachments: 'message-attachments',
  /** Аватары участников (публичный). */
  participantAvatars: 'participant-avatars',
  /** Docbuilder — сгенерированные документы (публичный). */
  docbuilder: 'docbuilder',
  /** Docbuilder — скриншоты (публичный). */
  docbuilderScreenshots: 'docbuilder-screenshots',
  /** Docbuilder — обложки (публичный). */
  docbuilderCovers: 'docbuilder-covers',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

/**
 * Ссылка на бакет: известная константа (с автодополнением) ЛИБО произвольная
 * строка — часть бакетов приходит из БД (`files.bucket`).
 */
export type BucketRef = StorageBucket | (string & {})
