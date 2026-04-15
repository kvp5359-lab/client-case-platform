/**
 * Контент AI-панели.
 *
 * Единый интерфейс ProjectAiChat для любого контекста:
 * - С проектом: все источники (переписка, анкеты, документы, БЗ)
 * - Без проекта: только «Вся БЗ»
 */

import { ProjectAiChat } from './ProjectAiChat'
import { useProjectPermissions } from '@/hooks/permissions'

interface AiPanelContentProps {
  workspaceId: string
  projectId?: string
  templateId?: string
}

export function AiPanelContent({ workspaceId, projectId, templateId }: AiPanelContentProps) {
  const { hasModuleAccess } = useProjectPermissions({ projectId: projectId || '' })

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <ProjectAiChat
          projectId={projectId}
          workspaceId={workspaceId}
          templateId={templateId}
          hasKnowledgeProjectAccess={!!projectId && hasModuleAccess('ai_knowledge_project')}
          hasKnowledgeAllAccess={!projectId || hasModuleAccess('ai_knowledge_all')}
        />
      </div>
    </div>
  )
}
