import { describe, it, expect } from 'vitest'
import { expandFolderNameTemplate } from './folderNameTemplate'

describe('expandFolderNameTemplate', () => {
  const vars = {
    project_name: 'Иван Петров',
    description: 'ВНЖ Испания',
    short_id: 'PR-42',
    template_name: 'Бизнес-план',
    contact_name: 'Иван Петров',
    created_at: '2026-04-18T20:00:00Z',
  }

  it('подставляет переменные', () => {
    expect(expandFolderNameTemplate('БП_{date}_{project_name}', vars, false)).toBe(
      'БП_2026.04.18_Иван Петров',
    )
  })

  it('заменяет пробелы на _ при флаге', () => {
    expect(expandFolderNameTemplate('БП {date} {project_name}', vars, true)).toBe(
      'БП_2026.04.18_Иван_Петров',
    )
  })

  it('оставляет пробелы без флага', () => {
    expect(expandFolderNameTemplate('{project_name}', vars, false)).toBe('Иван Петров')
  })

  it('разбивает дату на компоненты', () => {
    expect(expandFolderNameTemplate('{year}-{month}-{day}', vars, false)).toBe('2026-04-18')
  })

  it('контакт, short_id, template_name', () => {
    expect(
      expandFolderNameTemplate('{template_name}/{contact_name}/{short_id}', vars, false),
    ).toBe('Бизнес-план/Иван Петров/PR-42')
  })

  it('пустые переменные не оставляют двойных пробелов', () => {
    expect(
      expandFolderNameTemplate('{project_name} {description}', { project_name: 'Тест' }, false),
    ).toBe('Тест')
  })

  it('неизвестные плейсхолдеры остаются как есть', () => {
    expect(expandFolderNameTemplate('{unknown}_{project_name}', vars, false)).toBe(
      '{unknown}_Иван Петров',
    )
  })
})
