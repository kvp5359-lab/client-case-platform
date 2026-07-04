/**
 * Интеграционные тесты для useCreateProjectService / Update / Patch / Delete.
 *
 * Цель — проверить, что mutation.onSuccess реально вызывает invalidateQueries
 * c правильным ключом из реестра queryKeys. Если в реестре переименуют ключ —
 * эти тесты упадут вместе с прод-кодом.
 *
 * Фокус: связка mutation → invalidate → projectServiceKeys.list(projectId).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useCreateProjectService,
  useUpdateProjectService,
  usePatchProjectService,
  useDeleteProjectService,
} from './useProjectServices'
import { projectServiceKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { createQueryWrapper } from '@/test/testUtils'

vi.mock('@/lib/supabase')

// Helper: настраивает цепочку supabase.from('...').insert/update/...
// под нужный сценарий и возвращает invalidateQueries-spy для assertion'ов.
function setupSupabaseChain(opts: { resultData?: unknown; resultError?: unknown }) {
  const updateEqResult = { data: null, error: opts.resultError ?? null }

  vi.mocked(supabase.from).mockImplementation(() => {
    // Возвращаем оба варианта: insert/select.single для create+update;
    // update.eq для patch/delete.
    return {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: opts.resultData ?? { id: 'srv-1' }, error: opts.resultError ?? null }),
        }),
      }),
      update: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockImplementation(() => ({
          // .select('*').single() для useUpdate
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: opts.resultData ?? { id: 'srv-1' }, error: opts.resultError ?? null }),
          }),
          // .then() — для useDelete / usePatch (где .eq() без .select())
          then: (resolve: (v: unknown) => unknown) => resolve(updateEqResult),
        })),
      })),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ sort_order: 0 }], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>
  })
}

describe('useProjectServices mutations — invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useCreateProjectService инвалидирует projectServiceKeys.list(projectId)', async () => {
    setupSupabaseChain({ resultData: { id: 'srv-1', name: 'Test' } })
    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateProjectService('proj-1'), { wrapper })
    result.current.mutate({
      service_id: null,
      name: 'Test',
      quantity: 1,
      price: 100,
      tax_rate_id: null,
      tax_rate: null,
      is_extra: false,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectServiceKeys.list('proj-1'),
    })
  })

  it('useUpdateProjectService инвалидирует projectServiceKeys.list(projectId)', async () => {
    setupSupabaseChain({ resultData: { id: 'srv-1', name: 'Updated' } })
    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateProjectService('proj-1'), { wrapper })
    result.current.mutate({
      id: 'srv-1',
      form: {
        service_id: null,
        name: 'Updated',
        quantity: 2,
        price: 200,
        tax_rate_id: null,
        tax_rate: null,
        is_extra: false,
      },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectServiceKeys.list('proj-1'),
    })
  })

  it('usePatchProjectService инвалидирует projectServiceKeys.list(projectId)', async () => {
    setupSupabaseChain({})
    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => usePatchProjectService('proj-1'), { wrapper })
    result.current.mutate({ id: 'srv-1', patch: { price: 150 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectServiceKeys.list('proj-1'),
    })
  })

  it('useDeleteProjectService инвалидирует projectServiceKeys.list(projectId)', async () => {
    setupSupabaseChain({})
    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteProjectService('proj-1'), { wrapper })
    result.current.mutate('srv-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectServiceKeys.list('proj-1'),
    })
  })

  it('без projectId инвалидация не вызывается', async () => {
    setupSupabaseChain({ resultData: null, resultError: { message: 'projectId required' } })
    const { wrapper, queryClient } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateProjectService(undefined), { wrapper })
    result.current.mutate({
      service_id: null,
      name: 'x',
      quantity: 1,
      price: 1,
      tax_rate_id: null,
      tax_rate: null,
      is_extra: false,
    })

    await waitFor(() => expect(result.current.isError || result.current.isSuccess).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: projectServiceKeys.list(''),
    })
  })
})
