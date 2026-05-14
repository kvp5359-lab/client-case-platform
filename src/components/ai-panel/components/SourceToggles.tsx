import { BookOpen } from 'lucide-react'
import type {
  AiSources,
  ProjectContextScope,
} from '@/services/api/messenger/messengerAiService'
import {
  ProjectContextPicker,
  type ProjectContextOption,
} from './ProjectContextPicker'

interface Props {
  sources: AiSources
  toggleSource: (key: 'formData' | 'documents') => void
  setKnowledge: (value: 'project' | 'all' | null) => void
  setProjectContextScope: (scope: ProjectContextScope) => void
  formKitCount: number
  documentCount: number
  /** Сколько записей с текстом уйдёт в AI при текущем scope. Для подписи. */
  projectContextEffectiveCount?: number
  /** Полный список доступных записей контекста — для picker'а. */
  projectContextOptions?: ProjectContextOption[]
  hasProject: boolean
  hasKnowledgeProjectAccess?: boolean
  hasKnowledgeAllAccess?: boolean
  hasProjectContextAccess?: boolean
}

export function SourceToggles({
  sources,
  toggleSource,
  setKnowledge,
  setProjectContextScope,
  formKitCount,
  documentCount,
  projectContextEffectiveCount = 0,
  projectContextOptions = [],
  hasProject,
  hasKnowledgeProjectAccess,
  hasKnowledgeAllAccess,
  hasProjectContextAccess,
}: Props) {
  return (
    <>
      {hasProject && (
        <div className="inline-flex items-center">
          <button
            type="button"
            onClick={() => formKitCount > 0 && toggleSource('formData')}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-l-full border transition-colors ${
              formKitCount === 0
                ? 'opacity-40 cursor-default'
                : sources.formData
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800 cursor-pointer'
                  : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted cursor-pointer'
            }`}
          >
            Анкеты <span className="opacity-70">{formKitCount}</span>
          </button>
          <button
            type="button"
            onClick={() => documentCount > 0 && toggleSource('documents')}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-r-full border border-l-0 transition-colors ${
              documentCount === 0
                ? 'opacity-40 cursor-default'
                : sources.documents
                  ? 'bg-amber-100 border-amber-300 text-amber-800 cursor-pointer'
                  : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted cursor-pointer'
            }`}
          >
            Документы <span className="opacity-70">{documentCount}</span>
          </button>
        </div>
      )}

      {hasProject && hasProjectContextAccess && (
        <ProjectContextPicker
          scope={sources.projectContext}
          items={projectContextOptions}
          effectiveCount={projectContextEffectiveCount}
          setScope={setProjectContextScope}
        />
      )}

      {(hasKnowledgeProjectAccess || hasKnowledgeAllAccess) && (
        <div
          className={`inline-flex items-center rounded-full border overflow-hidden ${
            sources.knowledge === 'project'
              ? 'border-violet-300'
              : sources.knowledge === 'all'
                ? 'border-pink-300'
                : 'border-border'
          }`}
        >
          {hasKnowledgeProjectAccess && (
            <button
              type="button"
              onClick={() => setKnowledge(sources.knowledge === 'project' ? null : 'project')}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors cursor-pointer ${
                sources.knowledge === 'project'
                  ? 'bg-violet-100 text-violet-800'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              БЗ проекта
            </button>
          )}
          {hasKnowledgeAllAccess && (
            <button
              type="button"
              onClick={() => setKnowledge(sources.knowledge === 'all' ? null : 'all')}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 transition-colors cursor-pointer ${
                hasKnowledgeProjectAccess ? 'border-l border-border' : ''
              } ${
                sources.knowledge === 'all'
                  ? 'bg-pink-100 text-pink-800'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              Вся база знаний
            </button>
          )}
        </div>
      )}
    </>
  )
}
