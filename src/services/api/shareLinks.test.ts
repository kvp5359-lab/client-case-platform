/**
 * Регресс инцидента 2026-07-22: с локального dev (общая БД с продом) публичная
 * ссылка «молнии» строилась от адреса вкладки и уходила клиенту как
 * `http://localhost:8080/a/…` — Telegram такие молча выбрасывает, у клиента
 * оставался голый текст. Локальный origin обязан подменяться каноническим
 * публичным. Прод-origin (https) — оставаться как есть: воркспейсы живут на
 * своих поддоменах, ссылка должна вести на домен воркспейса.
 */
import { describe, it, expect } from 'vitest'
import { isLocalShareOrigin } from './shareLinks'

const loc = (protocol: string, hostname: string) => ({ protocol, hostname })

describe('isLocalShareOrigin', () => {
  it('любой http (не https) — локальный: ловит localhost, LAN-IP, IPv6', () => {
    expect(isLocalShareOrigin(loc('http:', 'localhost'))).toBe(true)
    expect(isLocalShareOrigin(loc('http:', '192.168.1.5'))).toBe(true)
    expect(isLocalShareOrigin(loc('http:', '10.0.0.7'))).toBe(true)
    expect(isLocalShareOrigin(loc('http:', '[::1]'))).toBe(true)
  })

  it('https на локальных хостах (self-signed) — тоже локальный', () => {
    expect(isLocalShareOrigin(loc('https:', 'localhost'))).toBe(true)
    expect(isLocalShareOrigin(loc('https:', '127.0.0.1'))).toBe(true)
    expect(isLocalShareOrigin(loc('https:', 'app.localhost'))).toBe(true)
    expect(isLocalShareOrigin(loc('https:', 'dev.local'))).toBe(true)
  })

  it('боевые домены (https) — НЕ локальные, origin вкладки сохраняется', () => {
    expect(isLocalShareOrigin(loc('https:', 'rs.clientcase.app'))).toBe(false)
    expect(isLocalShareOrigin(loc('https:', 'my.clientcase.app'))).toBe(false)
    expect(isLocalShareOrigin(loc('https:', 'clientcase.kvp-projects.com'))).toBe(false)
  })
})
