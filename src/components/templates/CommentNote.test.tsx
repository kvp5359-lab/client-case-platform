/**
 * Тесты CommentNote — пометка «чем отличается от одноимённых» в строке списка.
 *
 * Ключевое: у шаблона без комментария не должно оставаться ни текста, ни
 * висящей вертикальной черты.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CommentNote } from './CommentNote'

const divider = (container: HTMLElement) => container.querySelector('[aria-hidden="true"]')

describe('CommentNote', () => {
  it('показывает комментарий', () => {
    const { container } = render(<CommentNote comment="для визы D" />)

    expect(container.textContent).toBe('для визы D')
  })

  it('рисует разделитель рядом с комментарием', () => {
    const { container } = render(<CommentNote comment="для визы D" />)

    expect(divider(container)).not.toBeNull()
  })

  it('без комментария не рисует ничего — включая разделитель', () => {
    const { container } = render(<CommentNote comment={null} />)

    expect(container.textContent).toBe('')
    expect(divider(container)).toBeNull()
  })

  it('пустая строка считается отсутствием комментария', () => {
    const { container } = render(<CommentNote comment="" />)

    expect(divider(container)).toBeNull()
  })
})
