import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('logger.error всегда вызывает console.error', () => {
    logger.error('что-то сломалось')
    expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'что-то сломалось')
  })

  it('logger.error передаёт несколько аргументов', () => {
    const err = new Error('boom')
    logger.error('контекст', err, { extra: true })
    expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'контекст', err, { extra: true })
  })

  it('logger.info, warn, debug определены и не падают', () => {
    expect(() => logger.info('msg')).not.toThrow()
    expect(() => logger.warn('msg')).not.toThrow()
    expect(() => logger.debug('msg')).not.toThrow()
  })

  it('logger.error с пустыми аргументами не падает', () => {
    expect(() => logger.error()).not.toThrow()
    expect(errorSpy).toHaveBeenCalledWith('[ERROR]')
  })
})
