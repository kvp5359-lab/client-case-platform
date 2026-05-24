/**
 * Контракты Edge Functions ↔ Фронт.
 *
 * Сейчас 51 из 62 `supabase.functions.invoke` без типа ответа → `data: any`.
 * Контракты пишем здесь, ВЫЗЫВАЕМ так:
 *
 *   import type { ImpersonateStartRequest, ImpersonateStartResponse } from '@/types/edgeContracts'
 *   const { data, error } = await supabase.functions.invoke<ImpersonateStartResponse>(
 *     'impersonate-start',
 *     { body: { participant_id } satisfies ImpersonateStartRequest },
 *   )
 *
 * Источник правды по сигнатурам — `supabase/functions/<name>/index.ts`.
 * При изменении edge function — обнови этот файл. Раздельные рантаймы
 * (Deno в edge, Node в фронте) не позволяют импортировать одно и то же.
 *
 * Покрыто пока: критичные функции. Остальные — органически при правках.
 */

// ── impersonate-start ──

export interface ImpersonateStartRequest {
  workspace_id: string
  target_user_id: string
}

export interface ImpersonateStartResponse {
  access_token: string
  expires_at: string
  expires_in: number
  session_id: string
  target: {
    id: string
    email: string
    name: string | null
    last_name: string | null
  }
}

// ── impersonate-end ──

export interface ImpersonateEndResponse {
  ok: boolean
}

// ── generate-project-digest ──

export interface GenerateProjectDigestRequest {
  workspace_id: string
  project_id: string
  period_start?: string // YYYY-MM-DD
  period_end?: string
  digest_type?: 'day' | 'week' | 'month' | 'custom'
  force?: boolean
  test_run?: boolean
  override_prompt?: string
}

export interface GenerateProjectDigestResponse {
  digest_id?: string
  content: string
  events_count: number
  generation_mode: 'auto_list' | 'llm'
  model: string | null
  saved: boolean
}

// ── set-participant-access ──

export interface SetParticipantAccessRequest {
  participant_id: string
  can_login: boolean
}

export interface SetParticipantAccessResponse {
  ok: boolean
}

// ── check-document ──

export interface CheckDocumentRequest {
  document_id: string
  workspace_id: string
}

export interface CheckDocumentResponse {
  ai_naming_suggestion?: string
  ai_check_summary?: string
  ai_check_status: 'pending' | 'success' | 'failed'
  error?: string
}

// ── transcribe-audio ──

export interface TranscribeAudioRequest {
  attachment_id: string
  workspace_id: string
}

export interface TranscribeAudioResponse {
  transcription: string
}
