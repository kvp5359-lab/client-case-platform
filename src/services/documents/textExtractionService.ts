import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * Запускает фоновое извлечение текста из документа.
 * Возвращает true если текст был успешно извлечён, false при ошибке/пропуске.
 * Если извлечение не сработает — check-document выполнит его при проверке.
 */
export async function triggerTextExtraction(documentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('extract-text', {
      body: { document_id: documentId },
    })
    if (error) {
      logger.debug('Background text extraction failed:', error)
      return false
    }
    if (data?.success) {
      logger.debug(
        `[OCR] ${data.method} | ${data.text_length} символов | ${data.timing?.total_ms}ms`,
      )
    }
    return data?.success === true
  } catch (err) {
    logger.debug('Background text extraction error:', err)
    return false
  }
}
