/**
 * Тесты для useWorkspacePermissions — проверка разрешений на уровне workspace
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWorkspacePermissions } from './useWorkspacePermissions'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { createQueryWrapper } from '@/test/testUtils'
import type { WorkspacePermissions } from '@/types/permissions'

// Тип для мока supabase.from()
type SupabaseFrom = ReturnType<typeof supabase.from>

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: vi.fn(),
}))

// Хелперы для создания мок-данных
function makeRole(
  name: string,
  permissions: Partial<WorkspacePermissions>,
  overrides: Record<string, unknown> = {},
) {
  const defaultPerms: WorkspacePermissions = {
    manage_workspace_settings: false,
    delete_workspace: false,
    manage_participants: false,
    manage_roles: false,
    manage_templates: false,
    manage_statuses: false,
    manage_features: false,
    create_projects: false,
    view_all_projects: false,
    edit_all_projects: false,
    delete_all_projects: false,
    view_knowledge_base: false,
    manage_knowledge_base: false,
    ...permissions,
  }
  return {
    id: `role-${name}`,
    name,
    workspace_id: 'ws-1',
    is_owner: false,
    is_system: false,
    permissions: defaultPerms,
    ...overrides,
  }
}

function setupSupabaseMock(
  participantResult: { data: unknown; error: unknown },
  rolesResult: { data: unknown; error: unknown },
) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'participants') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(participantResult),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseFrom
    }
    if (table === 'workspace_roles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(rolesResult),
        }),
      } as unknown as SupabaseFrom
    }
    return {} as unknown as SupabaseFrom
  })
}

describe('useWorkspacePermissions', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useWorkspaceContext).mockReturnValue({
      workspaceId: 'ws-1',
      workspace: undefined,
      isLoading: false,
      error: null,
    })
  })

  it('должен вернуть isLoading=true при начальной загрузке', () => {
    // Никогда не резолвим — данные "в полёте"
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'participants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockReturnValue(new Promise(() => {})),
                }),
              }),
            }),
          }),
        } as unknown as SupabaseFrom
      }
      if (table === 'workspace_roles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(new Promise(() => {})),
          }),
        } as unknown as SupabaseFrom
      }
      return {} as unknown as SupabaseFrom
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    expect(result.current.isLoading).toBe(true)
  })

  it('должен вернуть permissions=null когда нет пользователя', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>)

    setupSupabaseMock({ data: null, error: null }, { data: [], error: null })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.permissions).toBeNull()
  })

  it('должен вернуть permissions=null когда нет workspaceId', async () => {
    vi.mocked(useWorkspaceContext).mockReturnValue({
      workspaceId: undefined,
      workspace: undefined,
      isLoading: false,
      error: null,
    })

    setupSupabaseMock({ data: null, error: null }, { data: [], error: null })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.permissions).toBeNull()
  })

  it('должен объединять разрешения из нескольких ролей по принципу ИЛИ', async () => {
    const roleA = makeRole('Сотрудник', {
      create_projects: true,
      view_all_projects: false,
    })
    const roleB = makeRole('Менеджер', {
      create_projects: false,
      view_all_projects: true,
    })

    setupSupabaseMock(
      { data: { workspace_roles: ['Сотрудник', 'Менеджер'] }, error: null },
      { data: [roleA, roleB], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Оба разрешения должны быть true (ИЛИ)
    expect(result.current.permissions?.create_projects).toBe(true)
    expect(result.current.permissions?.view_all_projects).toBe(true)
    // Не было ни у одной роли — должно быть false
    expect(result.current.permissions?.delete_workspace).toBe(false)
  })

  it('can() должен вернуть true для предоставленного разрешения', async () => {
    const role = makeRole('Админ', {
      manage_participants: true,
    })

    setupSupabaseMock(
      { data: { workspace_roles: ['Админ'] }, error: null },
      { data: [role], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.can('manage_participants')).toBe(true)
  })

  it('can() должен вернуть false для запрещённого разрешения', async () => {
    const role = makeRole('Сотрудник', {
      manage_participants: false,
    })

    setupSupabaseMock(
      { data: { workspace_roles: ['Сотрудник'] }, error: null },
      { data: [role], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.can('manage_participants')).toBe(false)
  })

  it('isOwner=true когда пользователь имеет роль владельца', async () => {
    const ownerRole = makeRole(
      'Владелец',
      {
        manage_workspace_settings: true,
      },
      { is_owner: true },
    )

    setupSupabaseMock(
      { data: { workspace_roles: ['Владелец'] }, error: null },
      { data: [ownerRole], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isOwner).toBe(true)
  })

  it('isOwner=false когда пользователь имеет обычную роль', async () => {
    const regularRole = makeRole('Сотрудник', {
      create_projects: true,
    })

    setupSupabaseMock(
      { data: { workspace_roles: ['Сотрудник'] }, error: null },
      { data: [regularRole], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isOwner).toBe(false)
  })

  it('canViewAllProjects отражает разрешение view_all_projects', async () => {
    const role = makeRole('Админ', {
      view_all_projects: true,
    })

    setupSupabaseMock(
      { data: { workspace_roles: ['Админ'] }, error: null },
      { data: [role], error: null },
    )

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useWorkspacePermissions(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canViewAllProjects).toBe(true)
  })
})
