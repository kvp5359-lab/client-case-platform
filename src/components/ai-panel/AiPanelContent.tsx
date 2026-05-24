/**
 * Контент AI-панели.
 *
 * Единый интерфейс ProjectAiChat для любого контекста:
 * - С проектом: все источники (переписка, анкеты, документы, БЗ)
 * - Без проекта: только «Вся БЗ»
 */

import { ProjectAiChat } from './ProjectAiChat'
import { useProjectPermissions } from '@/hooks/permissions'

type AiPanelContentProps = {
  workspaceId: string
  projectId?: string
  templateId?: string
  /** Thread-scope ассистент для personal dialogs (без проекта). */
  threadId?: string
}

export function AiPanelContent({ workspaceId, projectId, templateId, threadId }: AiPanelContentProps) {
  const { hasModuleAccess } = useProjectPermissions({ projectId: projectId || '' })
  const hasThread = !projectId && !!threadId

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <ProjectAiChat
          projectId={projectId}
          workspaceId={workspaceId}
          templateId={templateId}
          threadId={threadId}
          hasKnowledgeProjectAccess={!!projectId && hasModuleAccess('ai_knowledge_project')}
          // Без проекта (knowledge + thread scope) — БЗ всегда доступна
          hasKnowledgeAllAccess={!projectId || hasModuleAccess('ai_knowledge_all')}
          // В thread-scope контекст проекта недоступен (нет проекта)
          hasProjectContextAccess={!!projectId && !hasThread && hasModuleAccess('project_context')}
        />
      </div>
    </div>
  )
}
