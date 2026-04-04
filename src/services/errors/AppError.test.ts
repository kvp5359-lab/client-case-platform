/**
 * Тесты для иерархии ошибок приложения
 */

import { describe, it, expect } from 'vitest'
import {
  AppError,
  DocumentError,
  ProjectError,
  FormKitError,
  DocumentKitError,
  PermissionError,
  ValidationError,
  ApiError,
  TaskError,
  ConversationError,
  ParticipantError,
  GoogleDriveError,
} from './AppError'

describe('AppError', () => {
  it('должен устанавливать message, code и details', () => {
    const error = new AppError('test message', 'TEST_CODE', { key: 'value' })
    expect(error.message).toBe('test message')
    expect(error.code).toBe('TEST_CODE')
    expect(error.details).toEqual({ key: 'value' })
  })

  it('должен наследоваться от Error', () => {
    const error = new AppError('test', 'CODE')
    expect(error).toBeInstanceOf(Error)
  })

  it('должен иметь name = AppError', () => {
    const error = new AppError('test', 'CODE')
    expect(error.name).toBe('AppError')
  })

  it('должен работать без details', () => {
    const error = new AppError('test', 'CODE')
    expect(error.details).toBeUndefined()
  })
})

describe('DocumentError', () => {
  it('должен иметь code = DOCUMENT_ERROR', () => {
    const error = new DocumentError('test')
    expect(error.code).toBe('DOCUMENT_ERROR')
    expect(error.name).toBe('DocumentError')
  })

  it('должен наследоваться от AppError и Error', () => {
    const error = new DocumentError('test')
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('ProjectError', () => {
  it('должен иметь code = PROJECT_ERROR', () => {
    const error = new ProjectError('test')
    expect(error.code).toBe('PROJECT_ERROR')
    expect(error.name).toBe('ProjectError')
  })

  it('должен наследоваться от AppError', () => {
    expect(new ProjectError('test')).toBeInstanceOf(AppError)
  })
})

describe('FormKitError', () => {
  it('должен иметь code = FORMKIT_ERROR', () => {
    const error = new FormKitError('test')
    expect(error.code).toBe('FORMKIT_ERROR')
    expect(error.name).toBe('FormKitError')
  })
})

describe('DocumentKitError', () => {
  it('должен иметь code = DOCUMENTKIT_ERROR', () => {
    const error = new DocumentKitError('test')
    expect(error.code).toBe('DOCUMENTKIT_ERROR')
    expect(error.name).toBe('DocumentKitError')
  })
})

describe('PermissionError', () => {
  it('должен иметь дефолтное сообщение', () => {
    const error = new PermissionError()
    expect(error.message).toBe('У вас нет прав для выполнения этого действия')
    expect(error.code).toBe('PERMISSION_ERROR')
    expect(error.name).toBe('PermissionError')
  })

  it('должен принимать кастомное сообщение', () => {
    const error = new PermissionError('Доступ запрещён')
    expect(error.message).toBe('Доступ запрещён')
  })
})

describe('ValidationError', () => {
  it('должен иметь code = VALIDATION_ERROR', () => {
    const error = new ValidationError('invalid data')
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.name).toBe('ValidationError')
  })
})

describe('ApiError', () => {
  it('должен иметь code = API_ERROR', () => {
    const error = new ApiError('api failed')
    expect(error.code).toBe('API_ERROR')
    expect(error.name).toBe('ApiError')
  })
})

describe('TaskError', () => {
  it('должен иметь code = TASK_ERROR', () => {
    const error = new TaskError('task failed')
    expect(error.code).toBe('TASK_ERROR')
    expect(error.name).toBe('TaskError')
  })
})

describe('ConversationError', () => {
  it('должен иметь code = CONVERSATION_ERROR', () => {
    const error = new ConversationError('chat failed')
    expect(error.code).toBe('CONVERSATION_ERROR')
    expect(error.name).toBe('ConversationError')
  })
})

describe('ParticipantError', () => {
  it('должен иметь code = PARTICIPANT_ERROR', () => {
    const error = new ParticipantError('participant failed')
    expect(error.code).toBe('PARTICIPANT_ERROR')
    expect(error.name).toBe('ParticipantError')
  })
})

describe('GoogleDriveError', () => {
  it('должен иметь code = GOOGLE_DRIVE_ERROR', () => {
    const error = new GoogleDriveError('drive failed')
    expect(error.code).toBe('GOOGLE_DRIVE_ERROR')
    expect(error.name).toBe('GoogleDriveError')
  })
})

describe('instanceof проверки', () => {
  it('все подклассы являются instanceof AppError', () => {
    const errors = [
      new DocumentError('test'),
      new ProjectError('test'),
      new FormKitError('test'),
      new DocumentKitError('test'),
      new PermissionError(),
      new ValidationError('test'),
      new ApiError('test'),
      new TaskError('test'),
      new ConversationError('test'),
      new ParticipantError('test'),
      new GoogleDriveError('test'),
    ]

    errors.forEach((error) => {
      expect(error).toBeInstanceOf(AppError)
      expect(error).toBeInstanceOf(Error)
    })
  })
})

describe('details', () => {
  it('должен передавать details через подклассы', () => {
    const details = { statusCode: 404, resource: 'document' }
    const error = new DocumentError('not found', details)
    expect(error.details).toEqual(details)
  })
})
