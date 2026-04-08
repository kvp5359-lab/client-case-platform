/**
 * Секция модулей проекта в редакторе типа проекта
 */

import { useState, useCallback, useRef } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Layers, ChevronDown, Plus, Trash2, CheckSquare } from 'lucide-react'
import { AVAILABLE_MODULES } from './constants'
import { LinkedTemplatesList } from './LinkedTemplatesList'
import { FileText, FolderOpen, BookOpen, Folder } from 'lucide-react'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'

interface TemplateTask {
  id: string
  name: string
  sort_order: number
}

interface ModulesSectionProps {
  enabledModules: string[]
  linkedForms: FormTemplateWithRelation[]
  linkedDocKits: DocumentKitTemplateWithRelation[]
  linkedKnowledgeArticles: KnowledgeArticleWithRelation[]
  linkedKnowledgeGroups: KnowledgeGroupWithRelation[]
  linkedTasks: TemplateTask[]
  onToggleModule: (moduleId: string) => void
  onAddForms: () => void
  onAddDocKits: () => void
  onAddKnowledge: () => void
  onRemoveForm: (relationId: string) => void
  onRemoveDocKit: (relationId: string) => void
  onRemoveKnowledgeArticle: (relationId: string) => void
  onRemoveKnowledgeGroup: (relationId: string) => void
  onAddTask: (name: string, sortOrder: number) => void
  onUpdateTask: (taskId: string, name: string) => void
  onRemoveTask: (taskId: string) => void
  isRemovingForm: boolean
  isRemovingDocKit: boolean
  isRemovingKnowledgeArticle: boolean
  isRemovingKnowledgeGroup: boolean
}

export function ModulesSection({
  enabledModules,
  linkedForms,
  linkedDocKits,
  linkedKnowledgeArticles,
  linkedKnowledgeGroups,
  linkedTasks,
  onToggleModule,
  onAddForms,
  onAddDocKits,
  onAddKnowledge,
  onRemoveForm,
  onRemoveDocKit,
  onRemoveKnowledgeArticle,
  onRemoveKnowledgeGroup,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  isRemovingForm,
  isRemovingDocKit,
  isRemovingKnowledgeArticle,
  isRemovingKnowledgeGroup,
}: ModulesSectionProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [newTaskName, setNewTaskName] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskName, setEditingTaskName] = useState('')
  const taskInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const toggleExpanded = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else next.add(moduleId)
      return next
    })
  }, [])

  const handleAddTask = () => {
    const name = newTaskName.trim()
    if (!name) return
    onAddTask(name, linkedTasks.length)
    setNewTaskName('')
    taskInputRef.current?.focus()
  }

  const handleStartEditTask = (task: TemplateTask) => {
    setEditingTaskId(task.id)
    setEditingTaskName(task.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const handleSaveEditTask = () => {
    const name = editingTaskName.trim()
    if (name && editingTaskId) {
      onUpdateTask(editingTaskId, name)
    }
    setEditingTaskId(null)
    setEditingTaskName('')
  }

  const handleCancelEditTask = () => {
    setEditingTaskId(null)
    setEditingTaskName('')
  }

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
          const isTasks = module.id === 'tasks'
          const hasContent =
            (isForms && isEnabled) ||
            (isDocuments && isEnabled) ||
            (isKnowledgeBase && isEnabled) ||
            (isTasks && isEnabled)
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
                : isTasks
                  ? linkedTasks.map((t) => t.name)
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
                {isEnabled && contentItems.length > 0 && (
                  <span className="text-xs text-muted-foreground truncate">
                    {contentItems.join(', ')}
                  </span>
                )}
                <span className="flex-1" />
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

                  {isTasks && isEnabled && (
                    <div className="bg-muted/20 px-4 py-2 border-t">
                      <div className="space-y-0.5">
                        {linkedTasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between px-2 rounded group hover:bg-background/60 transition-colors"
                          >
                            {editingTaskId === task.id ? (
                              <div className="flex items-center gap-2 min-w-0 py-0.5 flex-1">
                                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <Input
                                  ref={editInputRef}
                                  value={editingTaskName}
                                  onChange={(e) => setEditingTaskName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      handleSaveEditTask()
                                    }
                                    if (e.key === 'Escape') {
                                      handleCancelEditTask()
                                    }
                                  }}
                                  onBlur={handleSaveEditTask}
                                  className="h-6 text-sm flex-1"
                                />
                              </div>
                            ) : (
                              <div
                                className="flex items-center gap-2 min-w-0 py-1 flex-1 cursor-pointer"
                                onClick={() => handleStartEditTask(task)}
                              >
                                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{task.name}</span>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                              onClick={() => onRemoveTask(task.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-1">
                          <Input
                            ref={taskInputRef}
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddTask()
                              }
                            }}
                            placeholder="Название задачи..."
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleAddTask}
                            disabled={!newTaskName.trim()}
                            className="h-7 px-2 text-xs text-muted-foreground shrink-0"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Добавить
                          </Button>
                        </div>
                      </div>
                    </div>
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
