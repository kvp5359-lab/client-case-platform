/**
 * Тесты для useProjectPermissions — проверка разрешений на уровне проекта
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProjectPermissions } from './useProjectPermissions'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from './useWorkspacePermissions'
import { createQueryWrapper } from '@/test/testUtils'
import type {
  ProjectModuleAccess,
  ProjectPermissions,
  CommentsPermissions,
} from '@/types/permissions'

// Тип для мока supabase.from()
type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('./useWorkspacePermissions', () => ({
  useWorkspacePermissions: vi.fn(),
}))

// Хелпер для создания проектной роли
function makeProjectRole(
  name: string,
  moduleAccess: Partial<ProjectModuleAccess>,
  permissions: {
    settings?: Partial<ProjectPermissions['settings']>
    forms?: Partial<ProjectPermissions['forms']>
    documents?: Partial<ProjectPermissions['documents']>
    comments?: Partial<CommentsPermissions>
  },
) {
  const defaultModuleAccess: ProjectModuleAccess = {
    settings: false,
    forms: false,
    documents: false,
    threads: false,
    history: false,
    card_view: false,
    ai_document_check: false,
    ai_form_autofill: false,
    ai_knowledge_all: false,
    ai_knowledge_project: false,
    ai_project_assistant: false,
    comments: false,
    knowledge_base: false,
    ...moduleAccess,
  }

  const defaultPermissions: ProjectPermissions = {
    settings: {
      edit_project_info: false,
      manage_project_participants: false,
      manage_google_drive: false,
      delete_project: false,
    },
    forms: {
      add_forms: false,
      fill_forms: false,
      edit_own_form_answers: false,
      view_others_form_answers: false,
    },
    documents: {
      add_documents: false,
      view_documents: false,
      edit_documents: false,
      download_documents: false,
      move_documents: false,
      delete_documents: false,
      compress_pdf: false,
      view_document_technical_info: false,
      create_folders: false,
      add_document_kits: false,
    },
    comments: {
      view_comments: false,
      edit_comments: false,
      manage_comments: false,
    },
  }

  // Мержим вложенные объекты permissions
  if (permissions.settings) {
    defaultPermissions.settings = { ...defaultPermissions.settings, ...permissions.settings }
  }
  if (permissions.forms) {
    defaultPermissions.forms = { ...defaultPermissions.forms, ...permissions.forms }
  }
  if (permissions.documents) {
    defaultPermissions.documents = { ...defaultPermissions.documents, ...permissions.documents }
  }
  if (permissions.comments) {
    defaultPermissions.comments = { ...defaultPermissions.comments, ...permissions.comments }
  }

  return {
    id: `role-${name}`,
    name,
    workspace_id: 'ws-1',
    is_system: false,
    module_access: defaultModuleAccess,
    permissions: defaultPermissions,
  }
}

// Настройка supabase mock для проектных запросов.
//
// Хук делает три запроса:
//   1. projects: select('workspace_id').eq('id').single()
//   2. project_participants: select(...).eq().eq().eq().eq().maybeSingle()
//      — один JOIN-запрос, четыре eq(): project_id + три eq по participants!inner
//   3. project_roles: select('*').eq('workspace_id')
//
// Отдельный запрос к `participants` был убран при рефакторинге (теперь inner-join
// прямо внутри project_participants), поэтому мок для `participants` больше не нужен.
function setupSupabaseMock(opts: {
  projectData?: { data: unknown; error: unknown }
  projectParticipantData?: { data: unknown; error: unknown }
  rolesData?: { data: unknown; error: unknown }
}) {
  const projectResult = opts.projectData ?? { data: { workspace_id: 'ws-1' }, error: null }
  const projectParticipantResult = opts.projectParticipantData ?? { data: null, error: null }
  const rolesResult = opts.rolesData ?? { data: [], error: null }

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(projectResult),
          }),
        }),
      } as unknown as SupabaseFrom
    }
    if (table === 'project_participants') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue(projectParticipantResult),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom
    }
    if (table === 'project_roles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(rolesResult),
        }),
      } as unknown as SupabaseFrom
    }
    return {} as unknown as SupabaseFrom
  })
}

describe('useProjectPermissions', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
    } as unknown as ReturnType<typeof useAuth>)

    // По умолчанию — обычный пользователь (не админ workspace)
    vi.mocked(useWorkspacePermissions).mockReturnValue({
      isLoading: false,
      error: null,
      isOwner: false,
      can: () => false,
      permissions: null,
      userRoles: [],
      canViewAllProjects: false,
      refetch: vi.fn(),
    })
  })

  it('должен вернуть isLoading=true при начальной загрузке', () => {
    // Запросы никогда не резолвятся
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue(new Promise(() => {})),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue(new Promise(() => {})),
                  maybeSingle: vi.fn().mockReturnValue(new Promise(() => {})),
                }),
              }),
            }),
          }),
        }) as unknown as SupabaseFrom,
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    expect(result.current.isLoading).toBe(true)
  })

  it('админ workspace получает полный moduleAccess (всё true)', async () => {
    vi.mocked(useWorkspacePermissions).mockReturnValue({
      isLoading: false,
      error: null,
      isOwner: true,
      can: () => true,
      permissions: null,
      userRoles: ['Владелец'],
      canViewAllProjects: true,
      refetch: vi.fn(),
    })

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.moduleAccess).not.toBeNull()
    expect(result.current.moduleAccess?.settings).toBe(true)
    expect(result.current.moduleAccess?.forms).toBe(true)
    expect(result.current.moduleAccess?.documents).toBe(true)
    expect(result.current.moduleAccess?.threads).toBe(true)
    expect(result.current.moduleAccess?.history).toBe(true)
    expect(result.current.moduleAccess?.ai_document_check).toBe(true)
    expect(result.current.moduleAccess?.ai_form_autofill).toBe(true)
    expect(result.current.moduleAccess?.ai_knowledge_all).toBe(true)
    expect(result.current.moduleAccess?.ai_knowledge_project).toBe(true)
    expect(result.current.moduleAccess?.ai_project_assistant).toBe(true)
    expect(result.current.moduleAccess?.comments).toBe(true)
  })

  it('админ workspace получает полные permissions (всё true)', async () => {
    vi.mocked(useWorkspacePermissions).mockReturnValue({
      isLoading: false,
      error: null,
      isOwner: true,
      can: () => true,
      permissions: null,
      userRoles: ['Владелец'],
      canViewAllProjects: true,
      refetch: vi.fn(),
    })

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.permissions).not.toBeNull()
    // Settings
    expect(result.current.permissions?.settings.edit_project_info).toBe(true)
    expect(result.current.permissions?.settings.manage_project_participants).toBe(true)
    expect(result.current.permissions?.settings.manage_google_drive).toBe(true)
    expect(result.current.permissions?.settings.delete_project).toBe(true)
    // Forms
    expect(result.current.permissions?.forms.add_forms).toBe(true)
    expect(result.current.permissions?.forms.fill_forms).toBe(true)
    // Documents
    expect(result.current.permissions?.documents.add_documents).toBe(true)
    expect(result.current.permissions?.documents.view_documents).toBe(true)
    expect(result.current.permissions?.documents.delete_documents).toBe(true)
  })

  it('обычный пользователь получает объединённые permissions из ролей', async () => {
    const roleA = makeProjectRole(
      'Исполнитель',
      { documents: true, forms: true },
      {
        documents: { view_documents: true, download_documents: true },
        forms: { fill_forms: true },
      },
    )
    const roleB = makeProjectRole(
      'Участник',
      { documents: true, history: true },
      {
        documents: { view_documents: true, add_documents: true },
      },
    )

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: ['Исполнитель', 'Участник'] },
        error: null,
      },
      rolesData: { data: [roleA, roleB], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Объединение по ИЛИ: documents
    expect(result.current.permissions?.documents.view_documents).toBe(true)
    expect(result.current.permissions?.documents.download_documents).toBe(true)
    expect(result.current.permissions?.documents.add_documents).toBe(true)
    // Не было ни у одной роли
    expect(result.current.permissions?.documents.delete_documents).toBe(false)
    // Forms
    expect(result.current.permissions?.forms.fill_forms).toBe(true)
    expect(result.current.permissions?.forms.add_forms).toBe(false)
    // Module access по ИЛИ
    expect(result.current.moduleAccess?.documents).toBe(true)
    expect(result.current.moduleAccess?.forms).toBe(true)
    expect(result.current.moduleAccess?.history).toBe(true)
    expect(result.current.moduleAccess?.settings).toBe(false)
  })

  it('hasModuleAccess возвращает корректные значения', async () => {
    const role = makeProjectRole('Исполнитель', { documents: true, forms: false }, {})

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: ['Исполнитель'] },
        error: null,
      },
      rolesData: { data: [role], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasModuleAccess('documents')).toBe(true)
    expect(result.current.hasModuleAccess('forms')).toBe(false)
    expect(result.current.hasModuleAccess('settings')).toBe(false)
  })

  it('can() проверяет конкретное разрешение внутри модуля', async () => {
    const role = makeProjectRole(
      'Исполнитель',
      { documents: true },
      {
        documents: { view_documents: true, delete_documents: false },
      },
    )

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: ['Исполнитель'] },
        error: null,
      },
      rolesData: { data: [role], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.can('documents', 'view_documents')).toBe(true)
    expect(result.current.can('documents', 'delete_documents')).toBe(false)
  })

  it('comments permissions корректно объединяются из ролей', async () => {
    const roleA = makeProjectRole(
      'Комментатор',
      { comments: true },
      {
        comments: { view_comments: true, edit_comments: true, manage_comments: false },
      },
    )
    const roleB = makeProjectRole(
      'Модератор',
      { comments: true },
      {
        comments: { view_comments: true, edit_comments: false, manage_comments: true },
      },
    )

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: ['Комментатор', 'Модератор'] },
        error: null,
      },
      rolesData: { data: [roleA, roleB], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Объединение по ИЛИ: comments
    expect(result.current.moduleAccess?.comments).toBe(true)
    expect(result.current.permissions?.comments.view_comments).toBe(true)
    expect(result.current.permissions?.comments.edit_comments).toBe(true)
    expect(result.current.permissions?.comments.manage_comments).toBe(true)
    // can() для модуля comments
    expect(result.current.can('comments', 'view_comments')).toBe(true)
    expect(result.current.can('comments', 'manage_comments')).toBe(true)
  })

  it('админ workspace получает все comments permissions', async () => {
    vi.mocked(useWorkspacePermissions).mockReturnValue({
      isLoading: false,
      error: null,
      isOwner: true,
      can: () => true,
      permissions: null,
      userRoles: ['Владелец'],
      canViewAllProjects: true,
      refetch: vi.fn(),
    })

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.permissions?.comments.view_comments).toBe(true)
    expect(result.current.permissions?.comments.edit_comments).toBe(true)
    expect(result.current.permissions?.comments.manage_comments).toBe(true)
  })

  it('должен вернуть null permissions когда нет ролей', async () => {
    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: [] },
        error: null,
      },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.permissions).toBeNull()
    expect(result.current.moduleAccess).toBeNull()
  })

  // ─── Критичные дыры безопасности ───

  it('пользователь НЕ участник проекта получает null permissions и moduleAccess', async () => {
    // project_participants возвращает null — пользователя нет среди участников
    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [makeProjectRole('Исполнитель', { documents: true }, {})], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Не участник → нет ролей → нет прав
    expect(result.current.userProjectRoles).toEqual([])
    expect(result.current.permissions).toBeNull()
    expect(result.current.moduleAccess).toBeNull()
    expect(result.current.hasModuleAccess('documents')).toBe(false)
    expect(result.current.hasModuleAccess('settings')).toBe(false)
    expect(result.current.can('documents', 'view_documents')).toBe(false)
  })

  it('require() выбрасывает PermissionError для отсутствующего разрешения', async () => {
    const role = makeProjectRole(
      'Просмотр',
      { documents: true },
      {
        documents: { view_documents: true, delete_documents: false },
      },
    )

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: { project_roles: ['Просмотр'] }, error: null },
      rolesData: { data: [role], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Разрешённое — не падает
    expect(() => result.current.require('documents', 'view_documents')).not.toThrow()
    // Запрещённое — выбрасывает PermissionError
    expect(() => result.current.require('documents', 'delete_documents')).toThrow(
      /Нет разрешения/,
    )
  })

  it('require() для не участника проекта выбрасывает PermissionError', async () => {
    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(() => result.current.require('documents', 'view_documents')).toThrow()
    expect(() => result.current.require('settings', 'edit_project_info')).toThrow()
  })

  it('can() для модуля без разрешения возвращает false', async () => {
    const role = makeProjectRole(
      'Документы',
      { documents: true, comments: false },
      {
        documents: { view_documents: true },
      },
    )

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: { project_roles: ['Документы'] }, error: null },
      rolesData: { data: [role], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // can для модуля без активных разрешений
    expect(result.current.can('comments', 'view_comments')).toBe(false)
    expect(result.current.can('settings', 'delete_project')).toBe(false)
  })

  it('userProjectRoles содержит все роли пользователя в проекте', async () => {
    const roleA = makeProjectRole('Юрист', { documents: true }, {})
    const roleB = makeProjectRole('Координатор', { settings: true }, {})

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: {
        data: { project_roles: ['Юрист', 'Координатор'] },
        error: null,
      },
      rolesData: { data: [roleA, roleB], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userProjectRoles).toEqual(['Юрист', 'Координатор'])
  })

  it('переименование роли НЕ ломает доступ если имя в project_participants совпадает', async () => {
    // project_participants хранит имена ролей. Если в project_roles есть роль с тем же именем,
    // доступ работает. Это документирует архитектурное решение.
    const role = makeProjectRole('Юрист', { documents: true }, {
      documents: { view_documents: true },
    })

    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: { project_roles: ['Юрист'] }, error: null },
      rolesData: { data: [role], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.can('documents', 'view_documents')).toBe(true)
  })

  it('если у пользователя роль, которой нет в project_roles — все права false', async () => {
    // project_participants ссылается на роль, которой не существует в project_roles
    // (например, удалили или переименовали). Хук возвращает не null, а merged-объект
    // со всеми false. Функционально пользователь без прав.
    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: { project_roles: ['Юрист'] }, error: null },
      rolesData: { data: [], error: null }, // Роли нет
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.userProjectRoles).toEqual(['Юрист'])
    // permissions/moduleAccess не null, но все значения false
    expect(result.current.permissions).not.toBeNull()
    expect(result.current.moduleAccess).not.toBeNull()
    // Все важные права запрещены
    expect(result.current.permissions?.documents.view_documents).toBe(false)
    expect(result.current.permissions?.documents.delete_documents).toBe(false)
    expect(result.current.permissions?.settings.edit_project_info).toBe(false)
    expect(result.current.permissions?.settings.delete_project).toBe(false)
    expect(result.current.moduleAccess?.documents).toBe(false)
    expect(result.current.moduleAccess?.settings).toBe(false)
    // hasModuleAccess и can тоже отказывают
    expect(result.current.hasModuleAccess('documents')).toBe(false)
    expect(result.current.can('documents', 'view_documents')).toBe(false)
  })

  it('refetch вызывает оба refetch без падений', async () => {
    setupSupabaseMock({
      projectData: { data: { workspace_id: 'ws-1' }, error: null },
      projectParticipantData: { data: null, error: null },
      rolesData: { data: [], error: null },
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useProjectPermissions({ projectId: 'proj-1' }), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(() => result.current.refetch()).not.toThrow()
  })
})
