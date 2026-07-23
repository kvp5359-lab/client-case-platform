/**
 * Нормализация темы — опора правила Gmail «ответ со сменой темы = новый тред»
 * (инцидент 2026-07-23: «Certificados pendientes», отправленное кнопкой
 * «Ответить» на «Plan de negocios…», клеилось в старую цепочку по References).
 * Ошибка в любую сторону вредна: недорезали префикс → рвём НАСТОЯЩИЕ ответы
 * на новые треды; перерезали → продолжаем клеить чужие темы.
 */
import { describe, it, expect } from 'vitest'
import { normalizeEmailSubject } from './parsing'

describe('normalizeEmailSubject', () => {
  it('срезает Re:/Fwd:/Fw: без учёта регистра', () => {
    expect(normalizeEmailSubject('Re: Plan de negocios')).toBe('plan de negocios')
    expect(normalizeEmailSubject('FWD: Отчёт')).toBe('отчёт')
    expect(normalizeEmailSubject('fw: hello')).toBe('hello')
  })

  it('срезает цепочки префиксов и нумерованные Re[2]:', () => {
    expect(normalizeEmailSubject('Re: Re: Fwd: Договор')).toBe('договор')
    expect(normalizeEmailSubject('Re[2]: Договор')).toBe('договор')
  })

  it('схлопывает пробелы и регистр — «тот же разговор» при косметических отличиях', () => {
    expect(normalizeEmailSubject('  Plan   de  Negocios ')).toBe(
      normalizeEmailSubject('plan de negocios'),
    )
  })

  it('пустая/отсутствующая тема → пустая строка (смену темы не фиксируем)', () => {
    expect(normalizeEmailSubject(null)).toBe('')
    expect(normalizeEmailSubject('Re:')).toBe('')
  })

  it('разные темы остаются разными', () => {
    expect(normalizeEmailSubject('Certificados pendientes')).not.toBe(
      normalizeEmailSubject('Plan de negocios Anastasiia Nikolaeva'),
    )
  })

  it('«Re:» внутри темы не трогается', () => {
    expect(normalizeEmailSubject('Ответ на Re: не срезать')).toBe('ответ на re: не срезать')
  })
})
