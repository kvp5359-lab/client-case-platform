/**
 * Тесты для утилит Google Drive
 */

import { describe, it, expect } from 'vitest'
import {
  extractGoogleDriveFolderId,
  isValidGoogleDriveUrl,
  buildGoogleDriveFolderUrl,
} from './googleDrive'

describe('extractGoogleDriveFolderId', () => {
  it('должен извлекать ID из /drive/folders/ID', () => {
    const url = 'https://drive.google.com/drive/folders/1ABC_def-123'
    expect(extractGoogleDriveFolderId(url)).toBe('1ABC_def-123')
  })

  it('должен извлекать ID из /drive/u/0/folders/ID', () => {
    const url = 'https://drive.google.com/drive/u/0/folders/abc123'
    expect(extractGoogleDriveFolderId(url)).toBe('abc123')
  })

  it('должен извлекать ID из /open?id=ID', () => {
    const url = 'https://drive.google.com/open?id=folder_123'
    expect(extractGoogleDriveFolderId(url)).toBe('folder_123')
  })

  it('должен извлекать ID из URL с несколькими query-параметрами', () => {
    const url = 'https://drive.google.com/open?usp=sharing&id=abc-123'
    expect(extractGoogleDriveFolderId(url)).toBe('abc-123')
  })

  it('должен возвращать прямой ID', () => {
    expect(extractGoogleDriveFolderId('1ABC_def-123')).toBe('1ABC_def-123')
  })

  it('должен возвращать null для пустой строки', () => {
    expect(extractGoogleDriveFolderId('')).toBeNull()
  })

  it('должен возвращать null для строки из пробелов', () => {
    expect(extractGoogleDriveFolderId('   ')).toBeNull()
  })

  it('должен обрезать пробелы', () => {
    expect(extractGoogleDriveFolderId('  abc123  ')).toBe('abc123')
  })

  it('должен возвращать null для невалидного URL без ID', () => {
    expect(extractGoogleDriveFolderId('https://example.com/page')).toBeNull()
  })

  it('должен извлекать ID из URL с query-параметрами после folders/ID', () => {
    const url = 'https://drive.google.com/drive/folders/abc123?usp=sharing'
    expect(extractGoogleDriveFolderId(url)).toBe('abc123')
  })
})

describe('isValidGoogleDriveUrl', () => {
  it('должен возвращать true для валидного URL', () => {
    expect(isValidGoogleDriveUrl('https://drive.google.com/drive/folders/abc123')).toBe(true)
  })

  it('должен возвращать true для прямого ID', () => {
    expect(isValidGoogleDriveUrl('abc123')).toBe(true)
  })

  it('должен возвращать false для пустой строки', () => {
    expect(isValidGoogleDriveUrl('')).toBe(false)
  })

  it('должен возвращать false для невалидного URL', () => {
    expect(isValidGoogleDriveUrl('https://example.com/page')).toBe(false)
  })
})

describe('buildGoogleDriveFolderUrl', () => {
  it('должен строить корректный URL', () => {
    expect(buildGoogleDriveFolderUrl('abc123')).toBe(
      'https://drive.google.com/drive/folders/abc123'
    )
  })
})
