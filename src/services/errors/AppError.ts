import { logger } from '@/utils/logger'

/**
 * Базовый класс ошибок приложения
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/**
 * Ошибка работы с документами
 */
export class DocumentError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOCUMENT_ERROR', details)
    this.name = 'DocumentError'
  }
}

/**
 * Ошибка работы с проектами
 */
export class ProjectError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'PROJECT_ERROR', details)
    this.name = 'ProjectError'
  }
}

/**
 * Ошибка работы с наборами форм
 */
export class FormKitError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'FORMKIT_ERROR', details)
    this.name = 'FormKitError'
  }
}

/**
 * Ошибка работы с наборами документов
 */
export class DocumentKitError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOCUMENTKIT_ERROR', details)
    this.name = 'DocumentKitError'
  }
}

/**
 * Ошибка валидации (неверный формат данных, отсутствует обязательное поле)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details)
    this.name = 'ValidationError'
  }
}

/**
 * Ошибки работы с задачами
 */
export class TaskError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'TASK_ERROR', details)
    this.name = 'TaskError'
  }
}

/**
 * Ошибка доступа/прав
 */
export class PermissionError extends AppError {
  constructor(message: string = 'У вас нет прав для выполнения этого действия', details?: unknown) {
    super(message, 'PERMISSION_ERROR', details)
    this.name = 'PermissionError'
  }
}

/**
 * Ошибка работы с API
 */
export class ApiError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'API_ERROR', details)
    this.name = 'ApiError'
  }
}

/**
 * Ошибка работы с чатами и сообщениями
 */
export class ConversationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONVERSATION_ERROR', details)
    this.name = 'ConversationError'
  }
}

/**
 * Ошибка работы с участниками
 */
export class ParticipantError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'PARTICIPANT_ERROR', details)
    this.name = 'ParticipantError'
  }
}

/**
 * Ошибка работы с Google Drive
 */
export class GoogleDriveError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'GOOGLE_DRIVE_ERROR', details)
    this.name = 'GoogleDriveError'
  }
}

/**
 * Ошибка работы с комментариями
 */
export class CommentError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'COMMENT_ERROR', details)
    this.name = 'CommentError'
  }
}

/**
 * Ошибка работы с базой знаний
 */
export class KnowledgeBaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'KNOWLEDGE_BASE_ERROR', details)
    this.name = 'KnowledgeBaseError'
  }
}

/**
 * Ошибка работы с шаблонами документов (генерация DOCX)
 */
export class DocumentTemplateError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOCUMENT_TEMPLATE_ERROR', details)
    this.name = 'DocumentTemplateError'
  }
}

/**
 * Ошибка работы с генерацией документов
 */
export class DocumentGenerationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOCUMENT_GENERATION_ERROR', details)
    this.name = 'DocumentGenerationError'
  }
}

/**
 * Фабрика для создания handleServiceError — устраняет дублирование в сервисах.
 * Использование: const handleServiceError = createServiceErrorHandler(TaskError)
 */
export function createServiceErrorHandler<T extends AppError>(
  ErrorClass: new (message: string, details?: unknown) => T,
) {
  return (message: string, error: unknown): never => {
    if (error instanceof ErrorClass) throw error
    logger.error(message, error)
    throw new ErrorClass(message, error)
  }
}
