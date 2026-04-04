/**
 * GeneralSettingsTab — вкладка общих настроек workspace.
 *
 * Секции: информация (заглушка), AI настройки, VoyageAI настройки.
 */

import { useParams } from 'next/navigation'
import { WorkspaceInfoSection } from './components/WorkspaceInfoSection'
import { AISettingsSection } from './components/AISettingsSection'
import { VoyageAISettingsSection } from './components/VoyageAISettingsSection'
import { KnowledgeSummaryPromptSection } from './components/KnowledgeSummaryPromptSection'
import { NotificationSettingsSection } from './components/NotificationSettingsSection'
import { SendDelaySettingsSection } from './components/SendDelaySettingsSection'

export function GeneralSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  if (!workspaceId) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Общие настройки</h2>
        <p className="text-gray-600">Основная информация о рабочем пространстве</p>
      </div>

      <WorkspaceInfoSection workspaceId={workspaceId} />

      <NotificationSettingsSection workspaceId={workspaceId} />
      <SendDelaySettingsSection workspaceId={workspaceId} />
      <AISettingsSection workspaceId={workspaceId} />
      <VoyageAISettingsSection workspaceId={workspaceId} />
      <KnowledgeSummaryPromptSection workspaceId={workspaceId} />

      <p className="text-xs text-muted-foreground/40 pt-4">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}</p>
    </div>
  )
}
