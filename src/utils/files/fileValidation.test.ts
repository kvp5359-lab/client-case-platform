import { describe, it, expect } from 'vitest'
import {
  MAX_UPLOAD_SIZE,
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
  AUTOFILL_SUPPORTED_MIME_TYPES,
  validateUploadFile,
} from './fileValidation'

function makeFile(name: string, type: string, size: number): File {
  const file = new File([''], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('константы валидации файлов', () => {
  it('MAX_UPLOAD_SIZE = 50 МБ', () => {
    expect(MAX_UPLOAD_SIZE).toBe(50 * 1024 * 1024)
  })

  it('разрешённые MIME-типы включают PDF, Word и изображения', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('application/pdf')).toBe(true)
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('application/msword')).toBe(true)
    expect(
      ALLOWED_UPLOAD_MIME_TYPES.has(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true)
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('image/jpeg')).toBe(true)
    expect(ALLOWED_UPLOAD_MIME_TYPES.has('image/png')).toBe(true)
  })

  it('разрешённые расширения включают pdf, doc, docx, jpg, jpeg, png', () => {
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('pdf')).toBe(true)
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('doc')).toBe(true)
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('docx')).toBe(true)
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('jpg')).toBe(true)
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('jpeg')).toBe(true)
    expect(ALLOWED_UPLOAD_EXTENSIONS.has('png')).toBe(true)
  })

  it('AUTOFILL поддерживает PDF и изображения', () => {
    expect(AUTOFILL_SUPPORTED_MIME_TYPES).toContain('application/pdf')
    expect(AUTOFILL_SUPPORTED_MIME_TYPES).toContain('image/jpeg')
    expect(AUTOFILL_SUPPORTED_MIME_TYPES).toContain('image/png')
  })
})

describe('validateUploadFile', () => {
  it('возвращает null для валидного PDF', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024 * 1024)
    expect(validateUploadFile(file)).toBe(null)
  })

  it('возвращает null для валидного DOCX', () => {
    const file = makeFile(
      'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      1024
    )
    expect(validateUploadFile(file)).toBe(null)
  })

  it('возвращает ошибку для файла больше 50 МБ', () => {
    const file = makeFile('big.pdf', 'application/pdf', 51 * 1024 * 1024)
    const result = validateUploadFile(file)
    expect(result).not.toBe(null)
    expect(result).toContain('big.pdf')
    expect(result).toContain('превышает лимит 50 МБ')
  })

  it('возвращает ошибку для неразрешённого MIME-типа', () => {
    const file = makeFile('archive.zip', 'application/zip', 1024)
    const result = validateUploadFile(file)
    expect(result).not.toBe(null)
    expect(result).toContain('не поддерживается')
    expect(result).toContain('application/zip')
  })

  it('проверяет по расширению, если MIME пустой', () => {
    const file = makeFile('doc.pdf', '', 1024)
    expect(validateUploadFile(file)).toBe(null)
  })

  it('возвращает ошибку для пустого MIME и неразрешённого расширения', () => {
    const file = makeFile('archive.zip', '', 1024)
    const result = validateUploadFile(file)
    expect(result).not.toBe(null)
  })

  it('возвращает ошибку для пустого MIME и без расширения', () => {
    const file = makeFile('noextension', '', 1024)
    const result = validateUploadFile(file)
    expect(result).not.toBe(null)
  })

  it('расширение проверяется регистронезависимо', () => {
    const file = makeFile('doc.PDF', '', 1024)
    expect(validateUploadFile(file)).toBe(null)
  })
})
