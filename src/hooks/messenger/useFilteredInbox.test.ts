/**
 * Тесты для useFilteredInbox — главного фильтра inbox по правам доступа.
 *
 * Этот хук используется в сайдбаре, PanelTabs, InboxPage, FloatingPanelButtons и
 * favicon. Любая ошибка тут — пользователю показывают чужие треды или прячут свои.
 *
 * Покрываем:
 *  - 8 правил доступа из canAccessThread (проверены индирекцией через filtered output)
 *  - safety fallback: если тред не найден в access данных, он показывается
 *  - неавторизованный пользователь видит сырые треды без фильтрации
 *  - useSidebarInboxCounts: агрегация бейджей и счётчиков
 *  - useTotalFilteredUnreadCount: тонкая обёртка над totalUnread
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useFilteredInbox,
  useSidebarInboxCounts,
  useTotalFilteredUnreadCount,
} from './useFilteredInbox'
import { useAuth } from '@/contexts/AuthContext'
import { useInboxThreadsV2 } from './useInbox'
import { supabase } from '@/lib/supabase'
import { createQueryWrapper } from '@/test/testUtils'
import type { InboxThreadEntry } from '@/services/api/inboxService'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))
vi.mock('./useInbox', () => ({
  useInboxThreadsV2: vi.fn(),
}))

// ─── Хелперы ───

function inboxThread(overrides: Partial<InboxThreadEntry> = {}): InboxThreadEntry {
  return {
    thread_id: 't-1',
    thread_name: 'Чат',
    thread_icon: '💬',
    thread_accent_color: 'blue',
    project_id: 'proj-1',
    project_name: 'Проект',
    channel_type: 'web',
    legacy_channel: 'client',
    last_message_at: null,
    last_message_text: null,
    last_sender_name: null,
    last_sender_avatar_url: null,
    unread_count: 0,
    manually_unread: false,
    has_unread_reaction: false,
    last_reaction_emoji: null,
    last_reaction_at: null,
    last_reaction_sender_name: null,
    last_reaction_sender_avatar_url: null,
    last_reaction_message_preview: null,
    contact_email: null,
    email_subject: null,
    last_event_at: null,
    last_event_text: null,
    last_event_status_color: null,
    unread_event_count: 0,
    ...overrides,
  }
}

interface ThreadAccessStub {
  id: string
  project_id: string | null
  access_type: string
  access_roles: string[] | null
  created_by: string | null
}

function accessInfo(overrides: Partial<ThreadAccessStub> = {}): ThreadAccessStub {
  return {
    id: 't-1',
    project_id: 'proj-1',
    access_type: 'all',
    access_roles: null,
    created_by: 'someone-else',
    ...overrides,
  }
}

interface SidebarDataStub {
  threads: ThreadAccessStub[]
  myProjectRoles: Array<{
    project_id: string
    participant_id: string
    project_roles: string[]
  }>
  myMemberThreadIds: string[]
  myAssigneeThreadIds: string[]
}

function setupHookMocks(opts: {
  inboxThreads: InboxThreadEntry[]
  sidebarData: SidebarDataStub | null
  userId?: string | null
}) {
  if (opts.userId === null) {
    vi.mocked(useAuth).mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>)
  } else {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: opts.userId ?? 'user-1' },
    } as unknown as ReturnType<typeof useAuth>)
  }

  vi.mocked(useInboxThreadsV2).mockReturnValue({
    data: opts.inboxThreads,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useInboxThreadsV2>)

  // RPC get_sidebar_data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(supabase.rpc as any) = vi.fn().mockResolvedValue({
    data: opts.sidebarData,
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFilteredInbox', () => {
  it('возвращает сырые треды если пользователь не авторизован', async () => {
    const t1 = inboxThread({ thread_id: 't-1' })
    const t2 = inboxThread({ thread_id: 't-2' })

    setupHookMocks({
      inboxThreads: [t1, t2],
      sidebarData: { threads: [], myProjectRoles: [], myMemberThreadIds: [], myAssigneeThreadIds: [] },
      userId: null,
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toHaveLength(2)
    })

    expect(result.current.data.map((t) => t.thread_id)).toEqual(['t-1', 't-2'])
  })

  it('safety fallback: тред без access info показывается (не скрывается случайно)', async () => {
    // Inbox содержит тред, которого нет в sidebar-данных. Это значит,
    // что мы не уверены — показать или скрыть. Безопаснее показать,
    // чтобы не потерять видимость треда из-за рассинхронизации.
    const t = inboxThread({ thread_id: 't-orphan', project_id: 'unknown' })

    setupHookMocks({
      inboxThreads: [t],
      sidebarData: {
        threads: [], // Никаких access info
        myProjectRoles: [],
        myMemberThreadIds: [],
        myAssigneeThreadIds: [],
      },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
    })

    expect(result.current.data.map((t) => t.thread_id)).toContain('t-orphan')
  })

  describe('фильтрация по правилам доступа', () => {
    it('workspace-level тред (project_id=null) виден всем', async () => {
      const t = inboxThread({ thread_id: 't-ws', project_id: null })
      const access = accessInfo({
        id: 't-ws',
        project_id: null,
        access_type: 'custom',
      })

      setupHookMocks({
        inboxThreads: [t],
        sidebarData: {
          threads: [access],
          myProjectRoles: [], // даже не участник никакого проекта
          myMemberThreadIds: [],
          myAssigneeThreadIds: [],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.data.map((t) => t.thread_id)).toContain('t-ws')
    })

    it('access_type=all: участник проекта видит, не-участник не видит', async () => {
      const t1 = inboxThread({ thread_id: 't-mine', project_id: 'p-1' })
      const t2 = inboxThread({ thread_id: 't-other', project_id: 'p-2' })

      setupHookMocks({
        inboxThreads: [t1, t2],
        sidebarData: {
          threads: [
            accessInfo({ id: 't-mine', project_id: 'p-1', access_type: 'all' }),
            accessInfo({ id: 't-other', project_id: 'p-2', access_type: 'all' }),
          ],
          // Я участник только p-1, не p-2
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
          ],
          myMemberThreadIds: [],
          myAssigneeThreadIds: [],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      const ids = result.current.data.map((t) => t.thread_id)
      expect(ids).toContain('t-mine')
      expect(ids).not.toContain('t-other')
    })

    it('администратор проекта видит custom-тред без членства', async () => {
      const t = inboxThread({ thread_id: 't-custom', project_id: 'p-1' })

      setupHookMocks({
        inboxThreads: [t],
        sidebarData: {
          threads: [
            accessInfo({ id: 't-custom', project_id: 'p-1', access_type: 'custom' }),
          ],
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Администратор'] },
          ],
          myMemberThreadIds: [],
          myAssigneeThreadIds: [],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.data.map((t) => t.thread_id)).toContain('t-custom')
    })

    it('создатель видит свой custom-тред', async () => {
      const t = inboxThread({ thread_id: 't-mine', project_id: 'p-1' })

      setupHookMocks({
        inboxThreads: [t],
        sidebarData: {
          threads: [
            accessInfo({
              id: 't-mine',
              project_id: 'p-1',
              access_type: 'custom',
              created_by: 'user-1',
            }),
          ],
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
          ],
          myMemberThreadIds: [],
          myAssigneeThreadIds: [],
        },
        userId: 'user-1',
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.data.map((t) => t.thread_id)).toContain('t-mine')
    })

    it('исполнитель задачи видит её', async () => {
      const t = inboxThread({ thread_id: 't-task', project_id: 'p-1' })

      setupHookMocks({
        inboxThreads: [t],
        sidebarData: {
          threads: [
            accessInfo({ id: 't-task', project_id: 'p-1', access_type: 'custom' }),
          ],
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
          ],
          myMemberThreadIds: [],
          myAssigneeThreadIds: ['t-task'],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      expect(result.current.data.map((t) => t.thread_id)).toContain('t-task')
    })

    it('access_type=roles: пересечение даёт доступ, отсутствие — нет', async () => {
      const t1 = inboxThread({ thread_id: 't-yes', project_id: 'p-1' })
      const t2 = inboxThread({ thread_id: 't-no', project_id: 'p-1' })

      setupHookMocks({
        inboxThreads: [t1, t2],
        sidebarData: {
          threads: [
            accessInfo({
              id: 't-yes',
              project_id: 'p-1',
              access_type: 'roles',
              access_roles: ['Юрист', 'Координатор'],
            }),
            accessInfo({
              id: 't-no',
              project_id: 'p-1',
              access_type: 'roles',
              access_roles: ['Босс'],
            }),
          ],
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Юрист'] },
          ],
          myMemberThreadIds: [],
          myAssigneeThreadIds: [],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      const ids = result.current.data.map((t) => t.thread_id)
      expect(ids).toContain('t-yes')
      expect(ids).not.toContain('t-no')
    })

    it('access_type=custom: член треда видит, не-член не видит', async () => {
      const t1 = inboxThread({ thread_id: 't-yes', project_id: 'p-1' })
      const t2 = inboxThread({ thread_id: 't-no', project_id: 'p-1' })

      setupHookMocks({
        inboxThreads: [t1, t2],
        sidebarData: {
          threads: [
            accessInfo({ id: 't-yes', project_id: 'p-1', access_type: 'custom' }),
            accessInfo({ id: 't-no', project_id: 'p-1', access_type: 'custom' }),
          ],
          myProjectRoles: [
            { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
          ],
          myMemberThreadIds: ['t-yes'], // только t-yes
          myAssigneeThreadIds: [],
        },
      })

      const { wrapper, queryClient } = createQueryWrapper()
      const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

      await waitFor(() => {
        expect(queryClient.isFetching()).toBe(0)
      })

      const ids = result.current.data.map((t) => t.thread_id)
      expect(ids).toContain('t-yes')
      expect(ids).not.toContain('t-no')
    })
  })

  it('пробрасывает loading и error из useInboxThreadsV2', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useInboxThreadsV2).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useInboxThreadsV2>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.rpc as any) = vi.fn().mockResolvedValue({ data: null, error: null })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useFilteredInbox('ws-1'), { wrapper })

    expect(result.current.isLoading).toBe(true)
  })
})

describe('useSidebarInboxCounts', () => {
  it('возвращает нули для пустого инбокса', async () => {
    setupHookMocks({
      inboxThreads: [],
      sidebarData: { threads: [], myProjectRoles: [], myMemberThreadIds: [], myAssigneeThreadIds: [] },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useSidebarInboxCounts('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
    })

    expect(result.current.totalUnread).toBe(0)
    expect(result.current.projectData.badgeDisplays.size).toBe(0)
  })

  it('суммирует unread_count из всех доступных тредов одного проекта', async () => {
    setupHookMocks({
      inboxThreads: [
        inboxThread({
          thread_id: 't-1',
          project_id: 'p-1',
          unread_count: 3,
        }),
        inboxThread({
          thread_id: 't-2',
          project_id: 'p-1',
          unread_count: 5,
        }),
      ],
      sidebarData: {
        threads: [
          accessInfo({ id: 't-1', project_id: 'p-1' }),
          accessInfo({ id: 't-2', project_id: 'p-1' }),
        ],
        myProjectRoles: [
          { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
        ],
        myMemberThreadIds: [],
        myAssigneeThreadIds: [],
      },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useSidebarInboxCounts('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
      expect(result.current.totalUnread).toBe(8)
    })

    // По проекту есть бейдж
    expect(result.current.projectData.badgeDisplays.has('p-1')).toBe(true)
  })

  it('распределяет client/internal unread по каналам', async () => {
    setupHookMocks({
      inboxThreads: [
        inboxThread({
          thread_id: 't-client',
          project_id: 'p-1',
          legacy_channel: 'client',
          unread_count: 2,
        }),
        inboxThread({
          thread_id: 't-internal',
          project_id: 'p-1',
          legacy_channel: 'internal',
          unread_count: 4,
        }),
      ],
      sidebarData: {
        threads: [
          accessInfo({ id: 't-client', project_id: 'p-1' }),
          accessInfo({ id: 't-internal', project_id: 'p-1' }),
        ],
        myProjectRoles: [
          { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
        ],
        myMemberThreadIds: [],
        myAssigneeThreadIds: [],
      },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useSidebarInboxCounts('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
      expect(result.current.totalUnread).toBe(6)
    })

    expect(result.current.projectData.clientUnreadCounts.get('p-1')).toBe(2)
    expect(result.current.projectData.internalUnreadCounts.get('p-1')).toBe(4)
  })

  it('игнорирует треды без project_id (workspace-level не идут в счётчики проектов)', async () => {
    setupHookMocks({
      inboxThreads: [
        inboxThread({
          thread_id: 't-ws',
          project_id: null,
          unread_count: 2,
        }),
      ],
      sidebarData: {
        threads: [accessInfo({ id: 't-ws', project_id: null })],
        myProjectRoles: [],
        myMemberThreadIds: [],
        myAssigneeThreadIds: [],
      },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useSidebarInboxCounts('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
    })

    // totalUnread считает всё включая workspace-level
    expect(result.current.totalUnread).toBe(2)
    // Но в projectData ничего нет — нет project_id
    expect(result.current.projectData.badgeDisplays.size).toBe(0)
  })
})

describe('useTotalFilteredUnreadCount', () => {
  it('возвращает суммарное количество непрочитанных', async () => {
    setupHookMocks({
      inboxThreads: [
        inboxThread({ thread_id: 't-1', project_id: 'p-1', unread_count: 7 }),
      ],
      sidebarData: {
        threads: [accessInfo({ id: 't-1', project_id: 'p-1' })],
        myProjectRoles: [
          { project_id: 'p-1', participant_id: 'me', project_roles: ['Член'] },
        ],
        myMemberThreadIds: [],
        myAssigneeThreadIds: [],
      },
    })

    const { wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useTotalFilteredUnreadCount('ws-1'), { wrapper })

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0)
      expect(result.current.data).toBe(7)
    })
  })
})
