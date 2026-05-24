/**
 * Утилиты для режима «войти под пользователем» (impersonation).
 *
 * Состояние импersonации хранится в самом JWT (claim app_metadata.impersonated_by).
 * Оригинальная сессия владельца — backup в localStorage перед подменой.
 */

import type { Session } from '@supabase/supabase-js'

export const ORIGINAL_SESSION_BACKUP_KEY = 'cc_impersonation_original_session_v1'

export type ImpersonationClaim = {
  ownerId: string
  sessionId: string
}

type JwtAppMetadata = {
  impersonated_by?: string
  impersonation_session_id?: string
  [key: string]: unknown
}

type JwtPayload = {
  sub?: string
  exp?: number
  iat?: number
  email?: string
  app_metadata?: JwtAppMetadata
  [key: string]: unknown
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  if (typeof window === 'undefined') {
    return Buffer.from(padded + padding, 'base64').toString('utf-8')
  }
  return atob(padded + padding)
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = decodeBase64Url(parts[1])
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

export function getImpersonationClaim(session: Session | null): ImpersonationClaim | null {
  if (!session?.access_token) return null
  const payload = decodeJwtPayload(session.access_token)
  const meta = payload?.app_metadata
  if (!meta?.impersonated_by) return null
  return {
    ownerId: meta.impersonated_by,
    sessionId: meta.impersonation_session_id ?? '',
  }
}

type BackupSessionShape = {
  access_token: string
  refresh_token: string
  expires_at?: number | null
}

export function backupOriginalSession(session: Session): void {
  if (typeof window === 'undefined') return
  const data: BackupSessionShape = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
  }
  try {
    window.localStorage.setItem(ORIGINAL_SESSION_BACKUP_KEY, JSON.stringify(data))
  } catch {
    /* localStorage может быть заполнен или заблокирован */
  }
}

export function readOriginalSessionBackup(): BackupSessionShape | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORIGINAL_SESSION_BACKUP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as BackupSessionShape
  } catch {
    return null
  }
}

export function clearOriginalSessionBackup(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ORIGINAL_SESSION_BACKUP_KEY)
  } catch {
    /* ignore */
  }
}

/** Сообщение об ошибке от триггера БД, если попытались записать в режиме impersonation. */
export const IMPERSONATION_WRITE_ERROR_MARKER = 'Impersonation mode is read-only'

export function isImpersonationWriteError(err: unknown): boolean {
  if (!err) return false
  const msg =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : (err as { message?: string }).message ?? ''
  return msg.includes(IMPERSONATION_WRITE_ERROR_MARKER)
}
