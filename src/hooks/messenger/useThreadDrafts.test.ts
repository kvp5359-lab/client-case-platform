import { describe, it, expect } from 'vitest'
import { resolveDraftPreview } from './useThreadDrafts'
import type { DraftPreview } from '@/services/api/messenger/threadDraftService'

const remote = (over: Partial<DraftPreview> = {}): DraftPreview => ({
  threadId: 't1',
  content: '',
  hasFiles: false,
  ...over,
})

describe('resolveDraftPreview — пометка «Черновик» в строке инбокса', () => {
  it('нет ни локального, ни серверного — пометки нет', () => {
    expect(resolveDraftPreview(undefined, null)).toBeNull()
  })

  it('локальный черновик показывается', () => {
    expect(resolveDraftPreview(undefined, '<p>Привет</p>')).toBe('Привет')
  })

  it('серверный показывается, когда локального нет (другое устройство)', () => {
    expect(resolveDraftPreview(remote({ content: '<p>С телефона</p>' }), null)).toBe('С телефона')
  })

  it('локальный приоритетнее серверного — на этом устройстве он свежее', () => {
    // Сервер отстаёт на debounce синхронизации, поэтому побеждает локальный.
    expect(resolveDraftPreview(remote({ content: '<p>старое</p>' }), '<p>новое</p>')).toBe('новое')
  })

  it('черновик из одних файлов — маркер вложения', () => {
    expect(resolveDraftPreview(remote({ hasFiles: true }), null)).toBe('📎 Файл')
  })

  it('текст важнее маркера файлов', () => {
    expect(resolveDraftPreview(remote({ content: '<p>Текст</p>', hasFiles: true }), null)).toBe(
      'Текст',
    )
  })

  it('пустая разметка не считается черновиком', () => {
    expect(resolveDraftPreview(undefined, '<p></p>')).toBeNull()
    expect(resolveDraftPreview(remote({ content: '<p><br></p>' }), null)).toBeNull()
  })
})
