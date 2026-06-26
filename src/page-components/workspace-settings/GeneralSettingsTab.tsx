/**
 * GeneralSettingsTab — вкладка общих настроек workspace.
 *
 * Секции: информация (заглушка), AI настройки, VoyageAI настройки.
 */

import { useParams } from 'next/navigation'
import { WorkspaceInfoSection } from './components/WorkspaceInfoSection'
import { AISettingsSection } from './components/AISettingsSection'
import { VoyageAISettingsSection } from './components/VoyageAISettingsSection'
import { TranslationSettingsSection } from './components/TranslationSettingsSection'
import { KnowledgeSummaryPromptSection } from './components/KnowledgeSummaryPromptSection'
import { NotificationSettingsSection } from './components/NotificationSettingsSection'
import { SendDelaySettingsSection } from './components/SendDelaySettingsSection'
import { DeadlineFormatSection } from './components/DeadlineFormatSection'
import { DefaultTaskIconColorSection } from './components/DefaultTaskIconColorSection'
import { PerfTraceSection } from './components/PerfTraceSection'
import { InboxReconcileSection } from './components/InboxReconcileSection'

export function GeneralSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  if (!workspaceId) return null

  return (
    <div className="space-y-3">
      <WorkspaceInfoSection workspaceId={workspaceId} />

      <NotificationSettingsSection workspaceId={workspaceId} />
      <SendDelaySettingsSection workspaceId={workspaceId} />
      <DeadlineFormatSection workspaceId={workspaceId} />
      <DefaultTaskIconColorSection workspaceId={workspaceId} />
      <AISettingsSection workspaceId={workspaceId} />
      <TranslationSettingsSection workspaceId={workspaceId} />
      <VoyageAISettingsSection workspaceId={workspaceId} />
      <KnowledgeSummaryPromptSection workspaceId={workspaceId} />
      <InboxReconcileSection />
      <PerfTraceSection />

      <p className="text-xs text-muted-foreground/40 pt-4">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}</p>
    </div>
  )
}
