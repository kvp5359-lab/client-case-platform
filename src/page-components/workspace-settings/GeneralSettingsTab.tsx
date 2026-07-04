/**
 * GeneralSettingsTab — общие настройки workspace в двухпанельном виде:
 * слева меню секций (SettingsSubNav), справа выбранная секция (всегда раскрыта
 * через SettingsCardForceOpenContext). Единый стиль с другими разделами.
 */

import { useState } from 'react'
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
import { WorkspaceUsageSection } from './components/WorkspaceUsageSection'
import { SettingsSubNav, type SettingsSubNavGroup } from './components/SettingsSubNav'
import { SettingsCardForceOpenContext } from './components/SettingsCard'

type SectionId =
  | 'info'
  | 'notifications'
  | 'send-delay'
  | 'deadline'
  | 'task-default'
  | 'ai'
  | 'translation'
  | 'voyage'
  | 'kb-summary'
  | 'reconcile'
  | 'perf'
  | 'usage'

export function GeneralSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [active, setActive] = useState<SectionId>('info')

  if (!workspaceId) return null

  const groups: SettingsSubNavGroup[] = [
    {
      title: 'Пространство',
      items: [
        { id: 'info', label: 'Информация' },
        { id: 'notifications', label: 'Уведомления' },
        { id: 'send-delay', label: 'Задержка отправки' },
        { id: 'deadline', label: 'Формат сроков' },
        { id: 'task-default', label: 'Иконка и цвет задач' },
      ],
    },
    {
      title: 'AI',
      items: [
        { id: 'ai', label: 'AI-настройки' },
        { id: 'translation', label: 'Перевод сообщений' },
        { id: 'voyage', label: 'VoyageAI поиск' },
        { id: 'kb-summary', label: 'Промпт AI Summary' },
      ],
    },
    {
      title: 'Сервис',
      items: [
        { id: 'usage', label: 'Использование и данные' },
        { id: 'reconcile', label: 'Сверка Входящих' },
        { id: 'perf', label: 'Диагностика' },
      ],
    },
  ]

  const renderSection = () => {
    switch (active) {
      case 'info':
        return <WorkspaceInfoSection workspaceId={workspaceId} />
      case 'notifications':
        return <NotificationSettingsSection workspaceId={workspaceId} />
      case 'send-delay':
        return <SendDelaySettingsSection workspaceId={workspaceId} />
      case 'deadline':
        return <DeadlineFormatSection workspaceId={workspaceId} />
      case 'task-default':
        return <DefaultTaskIconColorSection workspaceId={workspaceId} />
      case 'ai':
        return <AISettingsSection workspaceId={workspaceId} />
      case 'translation':
        return <TranslationSettingsSection workspaceId={workspaceId} />
      case 'voyage':
        return <VoyageAISettingsSection workspaceId={workspaceId} />
      case 'kb-summary':
        return <KnowledgeSummaryPromptSection workspaceId={workspaceId} />
      case 'usage':
        return <WorkspaceUsageSection workspaceId={workspaceId} />
      case 'reconcile':
        return <InboxReconcileSection />
      case 'perf':
        return <PerfTraceSection />
      default:
        return null
    }
  }

  return (
    <div className="flex h-full bg-white rounded-lg border overflow-hidden">
      <SettingsSubNav groups={groups} activeId={active} onSelect={(id) => setActive(id as SectionId)} />
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <SettingsCardForceOpenContext.Provider value={true}>
          {renderSection()}
        </SettingsCardForceOpenContext.Provider>
      </div>
    </div>
  )
}
