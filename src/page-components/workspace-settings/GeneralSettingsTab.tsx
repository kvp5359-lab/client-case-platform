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
import { AccentPaletteSection } from './components/AccentPaletteSection'
import { PerfTraceSection } from './components/PerfTraceSection'
import { InboxReconcileSection } from './components/InboxReconcileSection'

export function GeneralSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()

  if (!workspaceId) return null

  return (
    <div className="space-y-3">
      <div className="mb-1">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Общие настройки</h2>
        <p className="text-sm text-gray-600">Основная информация о рабочем пространстве</p>
      </div>

      <WorkspaceInfoSection workspaceId={workspaceId} />

      <NotificationSettingsSection workspaceId={workspaceId} />
      <SendDelaySettingsSection workspaceId={workspaceId} />
      <DeadlineFormatSection workspaceId={workspaceId} />
      <DefaultTaskIconColorSection workspaceId={workspaceId} />
      <AccentPaletteSection workspaceId={workspaceId} />
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
