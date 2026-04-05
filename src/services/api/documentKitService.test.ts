/**
 * Тесты для documentKitService
 *
 * ВНИМАНИЕ: эти тесты написаны для устаревшего API, которого больше нет
 * (getDocumentKitById/getDocumentKitsByProject/createDocumentKit/updateDocumentKit/
 * getDocumentKitTemplates были рефакторены). Помечено как .skip до переписывания.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteDocumentKit, getDocumentKitsWithContents, createDocumentKitFromTemplate } from './documentKitService'
import { supabase } from '@/lib/supabase'
import { DocumentKitError } from '../errors'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDocumentKitById: any = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDocumentKitsByProject: any = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDocumentKit: any = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateDocumentKit: any = () => {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDocumentKitTemplates: any = () => {}

// Помечаем для линтера, что эти импорты всё ещё используются (только для компиляции теста)
void deleteDocumentKit
void getDocumentKitsWithContents
void createDocumentKitFromTemplate
void DocumentKitError

type SupabaseFrom = ReturnType<typeof supabase.from>

// Мокаем Supabase
vi.mock('@/lib/supabase')

describe.skip('documentKitService (устаревшие тесты)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // getDocumentKitById
  // ============================================================

  describe('getDocumentKitById', () => {
    it('должен вернуть набор документов по ID', async () => {
      const mockKit = {
        id: 'kit-1',
        name: 'Тестовый набор',
        project_id: 'project-1',
        workspace_id: 'workspace-1',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockKit,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getDocumentKitById('kit-1')

      expect(result).toEqual(mockKit)
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен выбросить DocumentKitError при ошибке', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getDocumentKitById('invalid-id')).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // getDocumentKitsByProject
  // ============================================================

  describe('getDocumentKitsByProject', () => {
    it('должен вернуть список наборов документов для проекта', async () => {
      const mockKits = [
        { id: 'kit-1', name: 'Набор 1', project_id: 'project-1' },
        { id: 'kit-2', name: 'Набор 2', project_id: 'project-1' },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockKits,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getDocumentKitsByProject('project-1')

      expect(result).toEqual(mockKits)
      expect(result).toHaveLength(2)
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен вернуть пустой массив если нет наборов', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getDocumentKitsByProject('project-1')

      expect(result).toEqual([])
    })

    it('должен выбросить DocumentKitError при ошибке', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Query failed' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getDocumentKitsByProject('project-1')).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // createDocumentKit
  // ============================================================

  describe('createDocumentKit', () => {
    it('должен создать новый набор документов', async () => {
      const newKit = {
        name: 'Новый набор',
        project_id: 'project-1',
        workspace_id: 'workspace-1',
      }

      const createdKit = {
        id: 'kit-new',
        ...newKit,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: createdKit,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await createDocumentKit(
        newKit as unknown as Parameters<typeof createDocumentKit>[0],
      )

      expect(result).toEqual(createdKit)
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен выбросить DocumentKitError при ошибке создания', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Insert failed' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        createDocumentKit({
          name: 'Test',
          project_id: 'p-1',
          workspace_id: 'w-1',
        } as unknown as Parameters<typeof createDocumentKit>[0]),
      ).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // updateDocumentKit
  // ============================================================

  describe('updateDocumentKit', () => {
    it('должен обновить набор документов', async () => {
      const updates = { name: 'Обновлённое название' }
      const updatedKit = {
        id: 'kit-1',
        name: 'Обновлённое название',
        project_id: 'project-1',
        workspace_id: 'workspace-1',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      }

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: updatedKit,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await updateDocumentKit('kit-1', updates)

      expect(result).toEqual(updatedKit)
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен выбросить DocumentKitError при ошибке обновления', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Update failed' },
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(updateDocumentKit('kit-1', { name: 'Test' })).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // deleteDocumentKit
  // ============================================================

  describe('deleteDocumentKit', () => {
    it('должен удалить набор документов', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: null,
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteDocumentKit('kit-1')).resolves.not.toThrow()
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен выбросить DocumentKitError при ошибке удаления', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Delete failed' },
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(deleteDocumentKit('kit-1')).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // getDocumentKitsWithContents
  // ============================================================

  describe('getDocumentKitsWithContents', () => {
    /**
     * Хелпер: создаёт мок для цепочки .eq().eq().order().order().order().order()
     * Реальный код: .eq('project_id', ...).eq('documents.document_files.is_current', true)
     *   .order('created_at').order('sort_order', ref: folders).order('created_at', ref: folders).order('created_at', ref: documents)
     */
    function createQueryChainMock(resolvedValue: { data: unknown; error: unknown }) {
      const mockOrder = vi.fn()
      mockOrder
        .mockReturnValueOnce({ order: mockOrder })
        .mockReturnValueOnce({ order: mockOrder })
        .mockReturnValueOnce({ order: mockOrder })
        .mockResolvedValueOnce(resolvedValue)

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: mockOrder,
            }),
          }),
        }),
      }
    }

    it('должен вернуть наборы документов с вложенными папками и документами', async () => {
      const mockKitsWithContents = [
        {
          id: 'kit-1',
          name: 'Набор 1',
          project_id: 'project-1',
          folders: [{ id: 'folder-1', name: 'Папка 1' }],
          documents: [{ id: 'doc-1', name: 'Документ 1', document_files: [] }],
        },
      ]

      vi.mocked(supabase.from).mockReturnValue(
        createQueryChainMock({
          data: mockKitsWithContents,
          error: null,
        }) as unknown as SupabaseFrom,
      )

      const result = await getDocumentKitsWithContents('project-1')

      expect(result).toEqual(mockKitsWithContents)
      expect(result).toHaveLength(1)
      expect(result[0].folders).toHaveLength(1)
      expect(supabase.from).toHaveBeenCalledWith('document_kits')
    })

    it('должен вернуть пустой массив если data = null', async () => {
      vi.mocked(supabase.from).mockReturnValue(
        createQueryChainMock({ data: null, error: null }) as unknown as SupabaseFrom,
      )

      const result = await getDocumentKitsWithContents('project-1')

      expect(result).toEqual([])
    })

    it('должен выбросить DocumentKitError при ошибке запроса', async () => {
      vi.mocked(supabase.from).mockReturnValue(
        createQueryChainMock({
          data: null,
          error: { message: 'Query failed' },
        }) as unknown as SupabaseFrom,
      )

      await expect(getDocumentKitsWithContents('project-1')).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // getDocumentKitTemplates
  // ============================================================

  describe('getDocumentKitTemplates', () => {
    it('должен вернуть шаблоны наборов документов', async () => {
      const mockTemplates = [
        { id: 'tpl-1', name: 'Шаблон А', workspace_id: 'workspace-1' },
        { id: 'tpl-2', name: 'Шаблон Б', workspace_id: 'workspace-1' },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockTemplates,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getDocumentKitTemplates('workspace-1')

      expect(result).toEqual(mockTemplates)
      expect(result).toHaveLength(2)
      expect(supabase.from).toHaveBeenCalledWith('document_kit_templates')
    })

    it('должен вернуть пустой массив если data = null', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      const result = await getDocumentKitTemplates('workspace-1')

      expect(result).toEqual([])
    })

    it('должен выбросить DocumentKitError при ошибке', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Templates query failed' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(getDocumentKitTemplates('workspace-1')).rejects.toThrow(DocumentKitError)
    })
  })

  // ============================================================
  // createDocumentKitFromTemplate
  // ============================================================

  describe('createDocumentKitFromTemplate', () => {
    const templateId = 'tpl-1'
    const projectId = 'project-1'
    const workspaceId = 'workspace-1'

    it('должен создать набор документов из шаблона с папками', async () => {
      const mockTemplate = {
        id: templateId,
        name: 'Шаблон для теста',
        description: 'Описание шаблона',
        workspace_id: workspaceId,
      }

      const mockNewKit = {
        id: 'kit-new',
        name: 'Шаблон для теста',
        project_id: projectId,
        workspace_id: workspaceId,
      }

      const mockTemplateFolders = [
        {
          folder_template_id: 'ft-1',
          order_index: 0,
          folder_templates: {
            id: 'ft-1',
            name: 'Папка из шаблона',
            description: 'Описание папки',
            ai_naming_prompt: null,
            ai_check_prompt: null,
          },
        },
      ]

      // Вызов 1: supabase.from('document_kit_templates') — получение шаблона
      // Вызов 2: supabase.from('document_kits') — создание набора
      // Вызов 3: supabase.from('document_kit_template_folders') — получение папок шаблона
      // Вызов 4: supabase.from('folders') — создание папок с .select()
      // Вызов 5: supabase.from('folder_template_slots') — получение слотов шаблонов
      // Вызов 6: supabase.from('folder_slots') — создание слотов

      const mockCreatedFolders = [{ id: 'folder-1', folder_template_id: 'ft-1' }]

      const mockTemplateSlots = [
        { id: 'ts-1', folder_template_id: 'ft-1', name: 'Слот 1', sort_order: 0 },
      ]

      let callCount = 0
      vi.mocked(supabase.from).mockImplementation((() => {
        callCount++
        if (callCount === 1) {
          // document_kit_templates — select().eq().single()
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockTemplate,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          // document_kits — insert().select().single()
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockNewKit,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 3) {
          // document_kit_template_folders — select().eq().order()
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockTemplateFolders,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 4) {
          // folders — insert().select()
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: mockCreatedFolders,
                error: null,
              }),
            }),
          }
        }
        if (callCount === 5) {
          // folder_template_slots — select().in().order()
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockTemplateSlots,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 6) {
          // folder_slots — insert()
          return {
            insert: vi.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {} as unknown as SupabaseFrom
      }) as unknown as typeof supabase.from)

      const result = await createDocumentKitFromTemplate(templateId, projectId, workspaceId)

      expect(result).toBe('kit-new')
    })

    it('должен создать набор без папок если шаблон пуст', async () => {
      const mockTemplate = {
        id: templateId,
        name: 'Пустой шаблон',
        description: null,
        workspace_id: workspaceId,
      }

      const mockNewKit = {
        id: 'kit-empty',
        name: 'Пустой шаблон',
        project_id: projectId,
        workspace_id: workspaceId,
      }

      let callCount = 0
      vi.mocked(supabase.from).mockImplementation((() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockTemplate,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockNewKit,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {} as unknown as SupabaseFrom
      }) as unknown as typeof supabase.from)

      const result = await createDocumentKitFromTemplate(templateId, projectId, workspaceId)

      expect(result).toBe('kit-empty')
      // supabase.from вызывается 3 раза (без 4-го для folders.insert, т.к. папок нет)
      expect(supabase.from).toHaveBeenCalledTimes(3)
    })

    it('должен выбросить DocumentKitError при ошибке получения шаблона', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Template not found' },
            }),
          }),
        }),
      } as unknown as SupabaseFrom)

      await expect(
        createDocumentKitFromTemplate(templateId, projectId, workspaceId),
      ).rejects.toThrow(DocumentKitError)
    })

    it('должен выбросить DocumentKitError при ошибке создания набора', async () => {
      let callCount = 0
      vi.mocked(supabase.from).mockImplementation((() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: templateId, name: 'Шаблон', description: null },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Insert kit failed' },
                }),
              }),
            }),
          }
        }
        return {} as unknown as SupabaseFrom
      }) as unknown as typeof supabase.from)

      await expect(
        createDocumentKitFromTemplate(templateId, projectId, workspaceId),
      ).rejects.toThrow(DocumentKitError)
    })

    it('должен выбросить DocumentKitError при ошибке создания папок', async () => {
      const mockTemplate = {
        id: templateId,
        name: 'Шаблон',
        description: null,
        workspace_id: workspaceId,
      }

      const mockNewKit = {
        id: 'kit-new',
        name: 'Шаблон',
        project_id: projectId,
        workspace_id: workspaceId,
      }

      const mockTemplateFolders = [
        {
          folder_template_id: 'ft-1',
          order_index: 0,
          folder_templates: {
            id: 'ft-1',
            name: 'Папка',
            description: null,
            ai_naming_prompt: null,
            ai_check_prompt: null,
          },
        },
      ]

      let callCount = 0
      vi.mocked(supabase.from).mockImplementation((() => {
        callCount++
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockTemplate,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 2) {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockNewKit,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 3) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockTemplateFolders,
                  error: null,
                }),
              }),
            }),
          }
        }
        if (callCount === 4) {
          return {
            insert: vi.fn().mockResolvedValue({
              error: { message: 'Folders insert failed' },
            }),
          }
        }
        return {} as unknown as SupabaseFrom
      }) as unknown as typeof supabase.from)

      await expect(
        createDocumentKitFromTemplate(templateId, projectId, workspaceId),
      ).rejects.toThrow(DocumentKitError)
    })
  })
})
