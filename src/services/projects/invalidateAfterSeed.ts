/**
 * Единая инвалидация кэша после посева контента шаблона в проект
 * (`seedProjectContent`) — общая точка для создания проекта и для кнопки
 * «Добавить из шаблона».
 *
 * Зачем отдельным модулем: посев трогает сразу пять срезов данных (задачи,
 * группы задач, план, наборы документов, анкеты). Если список ключей держать
 * в каждом окне отдельно, они разъезжаются — так уже было: после добавления
 * из шаблона группы задач приезжали в базу, но на экране список оставался
 * плоским до перезагрузки, потому что ключи групп никто не сбрасывал.
 *
 * Появился новый срез данных у посева — добавлять ключ СЮДА, не по местам.
 */

import type { QueryClient } from '@tanstack/react-query'
import {
  planKeys,
  documentKitKeys,
  formKitKeys,
  workspaceThreadKeys,
  folderSlotKeys,
} from '@/hooks/queryKeys'
import { taskGroupKeys } from '@/hooks/plan/useProjectTaskGroups'

export function invalidateAfterSeed(
  queryClient: QueryClient,
  { workspaceId, projectId }: { workspaceId: string; projectId: string },
): void {
  const keys = [
    planKeys.byProject(projectId),
    documentKitKeys.byProject(projectId),
    folderSlotKeys.byProject(projectId),
    formKitKeys.byProject(projectId),
    workspaceThreadKeys.workspace(workspaceId),
    // Группы задач и привязка «задача → группа»: без них список задач
    // отрисуется плоским, хотя в базе группы уже есть.
    taskGroupKeys.byProject(projectId),
    taskGroupKeys.membership(projectId),
  ]
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey })
}
