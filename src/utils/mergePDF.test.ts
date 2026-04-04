/**
 * Тесты для утилит объединения PDF
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPage, mockCopiedPage, mockPdfDoc, mockSourcePdf } = vi.hoisted(() => {
  const mockPage = { drawImage: vi.fn() }
  const mockImage = { width: 100, height: 200 }
  const mockCopiedPage = {}
  const mockPdfDoc = {
    save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    getPageCount: vi.fn().mockReturnValue(1),
    getPageIndices: vi.fn().mockReturnValue([0]),
    copyPages: vi.fn().mockResolvedValue([mockCopiedPage]),
    addPage: vi.fn().mockReturnValue(mockPage),
    embedPng: vi.fn().mockResolvedValue(mockImage),
    embedJpg: vi.fn().mockResolvedValue(mockImage),
  }
  const mockSourcePdf = {
    getPageIndices: vi.fn().mockReturnValue([0, 1]),
  }
  return { mockPage, mockImage, mockCopiedPage, mockPdfDoc, mockSourcePdf }
})

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue(mockPdfDoc),
    load: vi.fn().mockResolvedValue(mockSourcePdf),
  },
}))
vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { mergeFilesToPDF, downloadBlob } from './mergePDF'
import { PDFDocument } from 'pdf-lib'

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

describe('mergeFilesToPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPdfDoc.getPageCount.mockReturnValue(1)
    mockPdfDoc.copyPages.mockResolvedValue([mockCopiedPage])
    mockSourcePdf.getPageIndices.mockReturnValue([0, 1])
  })

  it('должен объединять PDF файлы через загрузку и копирование страниц', async () => {
    const files = [
      createMockFile('doc1.pdf', 500, 'application/pdf'),
    ]

    const result = await mergeFilesToPDF(files)

    expect(PDFDocument.load).toHaveBeenCalled()
    expect(mockPdfDoc.copyPages).toHaveBeenCalledWith(mockSourcePdf, [0, 1])
    expect(mockPdfDoc.addPage).toHaveBeenCalledWith(mockCopiedPage)
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.failedFiles).toHaveLength(0)
  })

  it('должен встраивать PNG через embedPng и JPEG через embedJpg', async () => {
    const files = [
      createMockFile('photo.png', 300, 'image/png'),
      createMockFile('photo.jpg', 400, 'image/jpeg'),
    ]

    await mergeFilesToPDF(files)

    expect(mockPdfDoc.embedPng).toHaveBeenCalled()
    expect(mockPdfDoc.embedJpg).toHaveBeenCalled()
    expect(mockPage.drawImage).toHaveBeenCalledTimes(2)
  })

  it('должен добавлять неподдерживаемые типы файлов в failedFiles', async () => {
    const files = [
      createMockFile('doc.pdf', 500, 'application/pdf'),
      createMockFile('archive.zip', 200, 'application/zip'),
    ]

    const result = await mergeFilesToPDF(files)

    expect(result.failedFiles).toHaveLength(1)
    expect(result.failedFiles[0].name).toBe('archive.zip')
    expect(result.failedFiles[0].error).toContain('Неподдерживаемый тип файла')
  })

  it('должен вызывать onProgress для каждого файла', async () => {
    const onProgress = vi.fn()
    const files = [
      createMockFile('a.pdf', 100, 'application/pdf'),
      createMockFile('b.pdf', 200, 'application/pdf'),
    ]

    await mergeFilesToPDF(files, { onProgress })

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })

  it('должен выбрасывать ошибку, если ни одна страница не была добавлена', async () => {
    mockPdfDoc.getPageCount.mockReturnValue(0)
    vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error('Файл повреждён'))

    const files = [
      createMockFile('broken.pdf', 500, 'application/pdf'),
    ]

    await expect(mergeFilesToPDF(files)).rejects.toThrow('Не удалось обработать ни один файл')
  })
})

describe('downloadBlob', () => {
  it('должен создать ссылку, кликнуть по ней и удалить', () => {
    const mockClick = vi.fn()
    const mockAnchor = {
      href: '',
      download: '',
      click: mockClick,
    } as unknown as HTMLAnchorElement

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor as unknown as HTMLElement)
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor as unknown as HTMLElement)

    const mockUrl = 'blob:http://localhost/fake-url'
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl)
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const blob = new Blob(['test'], { type: 'application/pdf' })
    downloadBlob(blob, 'result.pdf')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(mockAnchor.href).toBe(mockUrl)
    expect(mockAnchor.download).toBe('result.pdf')
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor)
    expect(mockClick).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl)

    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})
