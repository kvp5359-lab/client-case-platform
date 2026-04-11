/**
 * Секция модулей проекта в редакторе типа проекта
 */

import { useState, useCallback } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Layers, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { AVAILABLE_MODULES } from './constants'
import { LinkedTemplatesList } from './LinkedTemplatesList'
import { ProjectTemplateThreadList } from './ProjectTemplateThreadList'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import { FileText, FolderOpen, BookOpen, Folder } from 'lucide-react'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'

interface ModulesSectionProps {
  workspaceId: string
  projectTemplateId: string
  enabledModules: string[]
  linkedForms: FormTemplateWithRelation[]
  linkedDocKits: DocumentKitTemplateWithRelation[]
  linkedKnowledgeArticles: KnowledgeArticleWithRelation[]
  linkedKnowledgeGroups: KnowledgeGroupWithRelation[]
  onToggleModule: (moduleId: string) => void
  onAddForms: () => void
  onAddDocKits: () => void
  onAddKnowledge: () => void
  onRemoveForm: (relationId: string) => void
  onRemoveDocKit: (relationId: string) => void
  onRemoveKnowledgeArticle: (relationId: string) => void
  onRemoveKnowledgeGroup: (relationId: string) => void
  isRemovingForm: boolean
  isRemovingDocKit: boolean
  isRemovingKnowledgeArticle: boolean
  isRemovingKnowledgeGroup: boolean
}

export function ModulesSection({
  workspaceId,
  projectTemplateId,
  enabledModules,
  linkedForms,
  linkedDocKits,
  linkedKnowledgeArticles,
  linkedKnowledgeGroups,
  onToggleModule,
  onAddForms,
  onAddDocKits,
  onAddKnowledge,
  onRemoveForm,
  onRemoveDocKit,
  onRemoveKnowledgeArticle,
  onRemoveKnowledgeGroup,
  isRemovingForm,
  isRemovingDocKit,
  isRemovingKnowledgeArticle,
  isRemovingKnowledgeGroup,
}: ModulesSectionProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())

  // Загружаем шаблоны тредов, привязанные к типу проекта, чтобы собрать
  // превью-список (названия) для свёрнутого заголовка модуля "Задачи и чаты".
  const { data: scopedThreadTemplates = [] } = useThreadTemplatesByProjectTemplate(
    projectTemplateId,
  )

  const toggleExpanded = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }, [])

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-muted-foreground" />
          Модули проекта
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Выберите, какие модули будут доступны в проектах этого типа
        </p>
      </div>

      <div className="space-y-3">
        {AVAILABLE_MODULES.map((module) => {
          const Icon = module.icon
          const isEnabled = enabledModules.includes(module.id)
          const isForms = module.id === 'forms'
          const isDocuments = module.id === 'documents'
          const isKnowledgeBase = module.id === 'knowledge_base'
          const isThreads = module.id === 'threads'
          const hasContent =
            (isForms && isEnabled) ||
            (isDocuments && isEnabled) ||
            (isKnowledgeBase && isEnabled) ||
            (isThreads && isEnabled)
          const isExpanded = expandedModules.has(module.id)
          const contentItems = isForms
            ? linkedForms.map((r) => r.form_template.name)
            : isDocuments
              ? linkedDocKits.map((r) => r.document_kit_template.name)
              : isKnowledgeBase
                ? [
                    ...linkedKnowledgeGroups.map((r) => r.knowledge_group.name),
                    ...linkedKnowledgeArticles.map((r) => r.knowledge_article.title),
                  ]
                : isThreads
                  ? scopedThreadTemplates.map((t) => t.name)
                  : []

          return (
            <div key={module.id} className="border rounded-lg overflow-hidden">
              <div
                className={`
                  flex items-center gap-3 px-4 py-2.5 transition-colors
                  ${isEnabled ? 'bg-amber-50/70' : ''}
                `}
              >
                <Checkbox checked={isEnabled} onCheckedChange={() => onToggleModule(module.id)} />
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                {hasContent ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(module.id)}
                    className="flex items-center gap-1.5 min-w-0 group"
                  >
                    <span className="font-medium text-sm group-hover:underline shrink-0">
                      {module.label}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                ) : (
                  <span className="font-medium text-sm">{module.label}</span>
                )}
                {/* Превью контента: flex-1 + min-w-0 нужны, чтобы truncate
                    реально срабатывал и текст не выталкивал соседей (бейдж,
                    заголовок модуля) за границы строки. */}
                {isEnabled && contentItems.length > 0 ? (
                  <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                    {contentItems.join(', ')}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                {isEnabled && (
                  <Badge className="bg-amber-400 text-black hover:bg-amber-400 text-[11px] py-0 px-1.5 shrink-0">
                    Включён
                  </Badge>
                )}
              </div>

              {hasContent && isExpanded && (
                <>
                  {isForms && isEnabled && (
                    <LinkedTemplatesList
                      title="Шаблоны анкет"
                      count={linkedForms.length}
                      items={linkedForms.map((r) => ({ id: r.id, name: r.form_template.name }))}
                      icon={FileText}
                      onAdd={onAddForms}
                      onRemove={onRemoveForm}
                      isRemoving={isRemovingForm}
                    />
                  )}

                  {isDocuments && isEnabled && (
                    <LinkedTemplatesList
                      title="Шаблоны наборов документов"
                      count={linkedDocKits.length}
                      items={linkedDocKits.map((r) => ({
                        id: r.id,
                        name: r.document_kit_template.name,
                      }))}
                      icon={FolderOpen}
                      onAdd={onAddDocKits}
                      onRemove={onRemoveDocKit}
                      isRemoving={isRemovingDocKit}
                    />
                  )}

                  {isThreads && isEnabled && (
                    <ProjectTemplateThreadList
                      workspaceId={workspaceId}
                      projectTemplateId={projectTemplateId}
                      emptyHint="Шаблонов задач и чатов пока нет"
                      addLabel="Добавить шаблон"
                    />
                  )}

                  {isKnowledgeBase && isEnabled && (
                    <div className="bg-muted/20 px-4 py-1 border-t">
                      <div className="-space-y-0.5">
                        {linkedKnowledgeGroups.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between py-0 px-2 rounded group hover:bg-background/60 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-sm truncate">{r.knowledge_group.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveKnowledgeGroup(r.id)
                              }}
                              disabled={isRemovingKnowledgeGroup}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        {linkedKnowledgeArticles.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between py-0 px-2 rounded group hover:bg-background/60 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate">{r.knowledge_article.title}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveKnowledgeArticle(r.id)
                              }}
                              disabled={isRemovingKnowledgeArticle}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            onAddKnowledge()
                          }}
                          className="h-7 text-xs text-muted-foreground"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Добавить
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
