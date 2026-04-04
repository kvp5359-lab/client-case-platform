export const AUTOFILL_AI_WARNING = '⚠️ AI проанализирует документ. Это займёт 10-30 секунд'

export interface ExtractionResult {
  extracted_data: Record<string, string | number | boolean | null | Record<string, unknown>>
  stats: {
    total: number
    filled: number
    percentage: number
  }
}
