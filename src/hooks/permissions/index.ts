/**
 * Хуки для проверки прав доступа
 *
 * Используют SQL функции из базы данных для проверки разрешений
 */

export { useWorkspacePermissions, type WorkspacePermissionsResult } from './useWorkspacePermissions'
export { useProjectPermissions, type ProjectPermissionsResult } from './useProjectPermissions'
export { useWorkspaceFeatures, type WorkspaceFeaturesResult } from './useWorkspaceFeatures'
