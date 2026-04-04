import { PDFDocument } from 'pdf-lib'
import { logger } from '@/utils/logger'

export interface MergeOptions {
  onProgress?: (current: number, total: number) => void
}

export interface MergeResult {
  blob: Blob
  failedFiles: Array<{ name: string; error: string }>
}

/**
 * Объединяет несколько файлов (PDF и изображения) в один PDF документ
 * @param files - массив файлов для объединения
 * @param options - опции для отслеживания прогресса
 * @returns Результат объединения с Blob и списком ошибочных файлов
 */
export async function mergeFilesToPDF(files: File[], options?: MergeOptions): Promise<MergeResult> {
  const mergedPdf = await PDFDocument.create()
  const failedFiles: Array<{ name: string; error: string }> = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    // Обновляем прогресс
    options?.onProgress?.(i + 1, files.length)

    try {
      // Определяем тип файла
      const fileType = file.type

      if (fileType === 'application/pdf') {
        // Обрабатываем PDF файл
        await mergePDFFile(file, mergedPdf)
      } else if (fileType.startsWith('image/')) {
        // Обрабатываем изображение
        await mergeImageFile(file, mergedPdf)
      } else {
        failedFiles.push({
          name: file.name,
          error: `Неподдерживаемый тип файла: ${fileType}`,
        })
      }
    } catch (error) {
      // Если файл не удалось обработать - записываем ошибку и продолжаем
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
      failedFiles.push({
        name: file.name,
        error: errorMessage,
      })
      logger.error(`Ошибка обработки файла "${file.name}" при объединении PDF:`, error)
    }
  }

  // Проверяем, что хотя бы один файл был успешно обработан
  if (mergedPdf.getPageCount() === 0) {
    throw new Error('Не удалось обработать ни один файл')
  }

  // Сохраняем результат как Blob
  const pdfBytes = await mergedPdf.save()
  return {
    blob: new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
    failedFiles,
  }
}

/**
 * Добавляет все страницы из PDF файла в целевой PDF документ
 */
async function mergePDFFile(file: File, targetPdf: PDFDocument): Promise<void> {
  const arrayBuffer = await file.arrayBuffer()

  // Пытаемся загрузить PDF с опцией ignoreEncryption для обработки защищённых файлов
  const pdf = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  })

  // Копируем все страницы из исходного PDF
  const pages = await targetPdf.copyPages(pdf, pdf.getPageIndices())
  pages.forEach((page) => {
    targetPdf.addPage(page)
  })
}

/**
 * Добавляет изображение как новую страницу в PDF документ
 */
async function mergeImageFile(file: File, targetPdf: PDFDocument): Promise<void> {
  const arrayBuffer = await file.arrayBuffer()
  const fileType = file.type

  let image

  // Определяем тип изображения и встраиваем его
  if (fileType === 'image/png') {
    image = await targetPdf.embedPng(arrayBuffer)
  } else if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
    image = await targetPdf.embedJpg(arrayBuffer)
  } else {
    // Для других форматов (WebP, HEIC и т.д.) конвертируем через Canvas
    image = await convertAndEmbedImage(arrayBuffer, fileType, targetPdf)
  }

  // Создаём страницу с размерами изображения
  const page = targetPdf.addPage([image.width, image.height])

  // Размещаем изображение на всю страницу
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  })
}

/**
 * Конвертирует изображение в PNG через Canvas и встраивает в PDF
 */
async function convertAndEmbedImage(
  arrayBuffer: ArrayBuffer,
  mimeType: string,
  targetPdf: PDFDocument,
) {
  const IMAGE_LOAD_TIMEOUT = 30_000

  return new Promise<Awaited<ReturnType<typeof targetPdf.embedPng>>>((resolve, reject) => {
    const blob = new Blob([arrayBuffer], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const img = new Image()

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url)
      reject(new Error('Таймаут загрузки изображения'))
    }, IMAGE_LOAD_TIMEOUT)

    img.onload = async () => {
      clearTimeout(timeout)
      try {
        // Создаём canvas для конвертации
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Не удалось создать canvas context')

        ctx.drawImage(img, 0, 0)

        // Конвертируем в PNG
        const pngBlob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob((blob) => {
            if (blob) res(blob)
            else rej(new Error('Не удалось создать blob'))
          }, 'image/png')
        })

        const pngArrayBuffer = await pngBlob.arrayBuffer()
        const image = await targetPdf.embedPng(pngArrayBuffer)

        URL.revokeObjectURL(url)
        resolve(image)
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error)
      }
    }

    img.onerror = () => {
      clearTimeout(timeout)
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось загрузить изображение'))
    }

    img.src = url
  })
}

// Re-export для обратной совместимости
export { downloadBlob } from '@/utils/downloadBlob'
