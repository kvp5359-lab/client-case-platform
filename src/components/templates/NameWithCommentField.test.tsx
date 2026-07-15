/**
 * Тесты поля «Название | Комментарий».
 *
 * Смысл покрытия: ширину названия задаёт невидимый двойник текста, и именно за
 * ним едет разделитель. Если двойник перестанет повторять значение (или
 * placeholder у пустого поля), поле схлопнется — тестом это ловится сразу.
 *
 * Без jest-dom/user-event: в проекте их нет, поэтому проверки на голом DOM
 * и fireEvent.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { NameWithCommentField } from './NameWithCommentField'

// ── Helpers ─────────────────────────────────────────────

const setup = (props?: Partial<React.ComponentProps<typeof NameWithCommentField>>) => {
  const onNameChange = vi.fn()
  const onCommentChange = vi.fn()
  const { container } = render(
    <NameWithCommentField
      name=""
      comment=""
      onNameChange={onNameChange}
      onCommentChange={onCommentChange}
      {...props}
    />,
  )
  return { onNameChange, onCommentChange, container }
}

/** Двойник — единственный узел, скрытый от дерева доступности. */
const measurerText = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]')?.textContent

const inputByPlaceholder = (container: HTMLElement, placeholder: string) =>
  container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)

// ── Tests ───────────────────────────────────────────────

describe('NameWithCommentField', () => {
  it('меряет ширину по названию', () => {
    const { container } = setup({ name: 'Банковские выписки' })

    expect(measurerText(container)).toBe('Банковские выписки')
  })

  it('у пустого поля меряет по плейсхолдеру, иначе поле схлопнется в ноль', () => {
    const { container } = setup({ name: '', namePlaceholder: 'Название папки' })

    expect(measurerText(container)).toBe('Название папки')
  })

  it('сообщает о вводе названия', () => {
    const { container, onNameChange } = setup({ namePlaceholder: 'Название папки' })

    const input = inputByPlaceholder(container, 'Название папки')!
    fireEvent.change(input, { target: { value: 'Паспорта' } })

    expect(onNameChange).toHaveBeenCalledWith('Паспорта')
  })

  it('сообщает о вводе комментария', () => {
    const { container, onCommentChange } = setup({ commentPlaceholder: 'Комментарий' })

    const input = inputByPlaceholder(container, 'Комментарий')!
    fireEvent.change(input, { target: { value: 'для визы D' } })

    expect(onCommentChange).toHaveBeenCalledWith('для визы D')
  })

  it('комментарий имеет доступное имя, а не только плейсхолдер', () => {
    const { container } = setup({ commentPlaceholder: 'Комментарий' })

    const input = inputByPlaceholder(container, 'Комментарий')!

    expect(input.getAttribute('aria-label')).toMatch(/Комментарий/i)
  })

  it('название и двойник имеют одинаковый шрифт — иначе замер ширины разъедется', () => {
    const { container } = setup({ name: 'Паспорта', namePlaceholder: 'Название папки' })

    const measurer = container.querySelector('[aria-hidden="true"]')!
    const input = inputByPlaceholder(container, 'Название папки')!

    for (const fontClass of ['text-lg', 'font-semibold']) {
      expect(measurer.className).toContain(fontClass)
      expect(input.className).toContain(fontClass)
    }
  })
})
