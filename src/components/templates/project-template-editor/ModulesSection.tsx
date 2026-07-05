/**
 * Секция модулей проекта в редакторе типа проекта.
 *
 * Раскладка master-detail: слева список модулей (чекбокс вкл/выкл + выбор),
 * справа — настройка выбранного модуля (задачи, наборы документов, анкеты,
 * база знаний). Модули без доп. настроек справа показывают только описание.
 */

import { useState, useCallback } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Layers, Plus, Trash2, FileText, FolderOpen, BookOpen, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AVAILABLE_MODULES } from './constants'
import { LinkedTemplatesList } from './LinkedTemplatesList'
import { ProjectTemplateThreadList } from './ProjectTemplateThreadList'
import { useThreadTemplatesByProjectTemplate } from '@/hooks/messenger/useThreadTemplates'
import type {
  FormTemplateWithRelation,
  DocumentKitTemplateWithRelation,
  KnowledgeArticleWithRelation,
  KnowledgeGroupWithRelation,
} from './constants'

type ModulesSectionProps = {
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
  onReorderForms: (orderedRelationIds: string[]) => void
  onReorderDocKits: (orderedRelationIds: string[]) => void
  isRemovingForm: boolean
  isRemovingDocKit: boolean
  isRemovingKnowledgeArticle: boolean
  isRemovingKnowledgeGroup: boolean
}

// Модули с настройками в правой колонке (у остальных — только вкл/выкл).
const CONTENT_MODULES = new Set(['forms', 'documents', 'tasks', 'knowledge_base'])

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
  onReorderForms,
  onReorderDocKits,
  isRemovingForm,
  isRemovingDocKit,
  isRemovingKnowledgeArticle,
  isRemovingKnowledgeGroup,
}: ModulesSectionProps) {
  const [selectedId, setSelectedId] = useState<string>(AVAILABLE_MODULES[0]?.id ?? '')

  // Названия привязанных тредов — для превью в строке модуля «Задачи».
  const { data: scopedThreadTemplates = [] } = useThreadTemplatesByProjectTemplate(
    projectTemplateId,
  )

  const contentCount = useCallback(
    (moduleId: string): number => {
      switch (moduleId) {
        case 'forms':
          return linkedForms.length
        case 'documents':
          return linkedDocKits.length
        case 'tasks':
          return scopedThreadTemplates.length
        case 'knowledge_base':
          return linkedKnowledgeGroups.length + linkedKnowledgeArticles.length
        default:
          return 0
      }
    },
    [linkedForms, linkedDocKits, scopedThreadTemplates, linkedKnowledgeGroups, linkedKnowledgeArticles],
  )

  const selected = AVAILABLE_MODULES.find((m) => m.id === selectedId) ?? AVAILABLE_MODULES[0]
  const selectedEnabled = !!selected && enabledModules.includes(selected.id)

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-muted-foreground" />
          Модули проекта
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Слева включайте модули галочкой и выбирайте их, справа — настраивайте выбранный модуль.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(200px,260px)_1fr] items-start">
        {/* ── Левая колонка: список модулей ── */}
        <div className="space-y-1">
          {AVAILABLE_MODULES.map((module) => {
            const Icon = module.icon
            const isEnabled = enabledModules.includes(module.id)
            const isSelected = module.id === selected?.id
            const count = contentCount(module.id)
            return (
              // Строка — div (не button): внутри Radix-чекбокс сам рендерит
              // <button>, а вложенные кнопки — невалидный HTML. Выбор по клику,
              // вкл/выкл — чекбоксом (его клик не всплывает в select через stop).
              <div
                key={module.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(module.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(module.id)
                  }
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  isSelected ? 'border-amber-400 bg-amber-50/70' : 'border-transparent hover:bg-muted/60',
                )}
              >
                <span onClick={(e) => e.stopPropagation()} className="flex">
                  <Checkbox
                    checked={isEnabled}
                    onCheckedChange={() => onToggleModule(module.id)}
                  />
                </span>
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.label}</span>
                {CONTENT_MODULES.has(module.id) && isEnabled && count > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
                )}
                {isEnabled && (
                  <Badge className="shrink-0 bg-amber-400 px-1.5 py-0 text-[11px] text-black hover:bg-amber-400">
                    Вкл
                  </Badge>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Правая колонка: настройка выбранного модуля ── */}
        <div className="min-h-[240px] rounded-lg border">
          {selected && (
            <>
              <div className="flex items-start gap-3 border-b px-4 py-3">
                <selected.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{selected.label}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.description}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selectedEnabled}
                    onCheckedChange={() => onToggleModule(selected.id)}
                  />
                  {selectedEnabled ? 'Включён' : 'Выключен'}
                </label>
              </div>

              <div className="p-0">
                {!selectedEnabled ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Модуль выключен. Включите его галочкой выше, чтобы
                    {CONTENT_MODULES.has(selected.id) ? ' настроить содержимое.' : ' сделать доступным в проектах этого типа.'}
                  </p>
                ) : selected.id === 'forms' ? (
                  <LinkedTemplatesList
                    title="Шаблоны анкет"
                    count={linkedForms.length}
                    items={linkedForms.map((r) => ({ id: r.id, name: r.form_template.name }))}
                    icon={FileText}
                    onAdd={onAddForms}
                    onRemove={onRemoveForm}
                    onReorder={onReorderForms}
                    isRemoving={isRemovingForm}
                  />
                ) : selected.id === 'documents' ? (
                  <LinkedTemplatesList
                    title="Шаблоны наборов документов"
                    count={linkedDocKits.length}
                    items={linkedDocKits.map((r) => ({ id: r.id, name: r.document_kit_template.name }))}
                    icon={FolderOpen}
                    onAdd={onAddDocKits}
                    onRemove={onRemoveDocKit}
                    onReorder={onReorderDocKits}
                    isRemoving={isRemovingDocKit}
                  />
                ) : selected.id === 'tasks' ? (
                  <ProjectTemplateThreadList
                    workspaceId={workspaceId}
                    projectTemplateId={projectTemplateId}
                    emptyHint="Шаблонов задач пока нет"
                    addLabel="Добавить шаблон"
                  />
                ) : selected.id === 'knowledge_base' ? (
                  <div className="px-4 py-2">
                    <div className="-space-y-0.5">
                      {linkedKnowledgeGroups.map((r) => (
                        <div
                          key={r.id}
                          className="group flex items-center justify-between rounded px-2 py-0 transition-colors hover:bg-muted/60"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span className="truncate text-sm">{r.knowledge_group.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground transition-all hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                            onClick={() => onRemoveKnowledgeGroup(r.id)}
                            disabled={isRemovingKnowledgeGroup}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {linkedKnowledgeArticles.map((r) => (
                        <div
                          key={r.id}
                          className="group flex items-center justify-between rounded px-2 py-0 transition-colors hover:bg-muted/60"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm">{r.knowledge_article.title}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground transition-all hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                            onClick={() => onRemoveKnowledgeArticle(r.id)}
                            disabled={isRemovingKnowledgeArticle}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onAddKnowledge}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Добавить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    У этого модуля нет дополнительных настроек — он просто включается для
                    проектов этого типа.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
