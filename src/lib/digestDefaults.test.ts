/**
 * Страж синхронизации DEFAULT_DIGEST_SYSTEM_PROMPT.
 *
 * Промпт живёт в двух местах (фронт src/lib + edge function на Deno).
 * Разные рантаймы — общий импорт невозможен. Тест ловит расхождение
 * на CI/при сборке. При намеренном изменении — обновить ОБА места.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_DIGEST_SYSTEM_PROMPT } from './digestDefaults'

function extractEdgePrompt(): string {
  const path = resolve(__dirname, '../../supabase/functions/generate-project-digest/index.ts')
  const src = readFileSync(path, 'utf-8')
  const match = src.match(/const DEFAULT_SYSTEM_PROMPT = `([\s\S]*?)`;/)
  if (!match) {
    throw new Error('Не нашёл DEFAULT_SYSTEM_PROMPT в edge function')
  }
  return match[1]
}

describe('DEFAULT_DIGEST_SYSTEM_PROMPT', () => {
  it('синхронизирован с edge function generate-project-digest', () => {
    const edgePrompt = extractEdgePrompt()
    expect(edgePrompt).toBe(DEFAULT_DIGEST_SYSTEM_PROMPT)
  })
})
