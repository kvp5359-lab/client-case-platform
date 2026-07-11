/**
 * Наборы ролей для классификации участника чата (staff / external / client).
 *
 * Вынесены из `@/components/messenger/chatSettingsTypes` (нижний слой), чтобы
 * хуки могли импортировать их не поднимаясь в `components/`. chatSettingsTypes
 * реэкспортирует их для существующих импортёров со стороны UI.
 *
 * ⚠️ «Staff» здесь = ТОЛЬКО workspace-роли. Отличается от глобального
 * STAFF_ROLES из permissions.ts (туда входит project-роль «Исполнитель»).
 * Здесь специально без неё — getRoleGroup различает workspace и project
 * уровни через 4 группы: staff (workspace) / external / client / other.
 */

import { SYSTEM_WORKSPACE_ROLES } from '@/types/permissions'

export const STAFF_ROLES = [
  SYSTEM_WORKSPACE_ROLES.OWNER,
  SYSTEM_WORKSPACE_ROLES.ADMIN,
  SYSTEM_WORKSPACE_ROLES.EMPLOYEE,
]
export const EXTERNAL_ROLES = ['Внешний сотрудник']
export const CLIENT_ROLES = [SYSTEM_WORKSPACE_ROLES.CLIENT]
