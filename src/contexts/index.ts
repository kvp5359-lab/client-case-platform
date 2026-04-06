/**
 * Barrel export для всех контекстов приложения
 */

export { AuthProvider, useAuth } from './AuthContext'
export type { User, Session } from '@supabase/supabase-js'

export { WorkspaceProvider, useWorkspaceContext } from './WorkspaceContext'

export { ProjectProvider, useProject } from './ProjectContext'
export type { Project, ProjectTemplate, ProjectContextValue } from './ProjectContext'
