/**
 * ProjectTemplateEditorPage — страница редактирования типа проекта
 *
 * Позволяет:
 * - Редактировать название и описание типа проекта
 * - Управлять модулями (анкеты, документы, задачи и т.д.)
 * - Добавлять/удалять шаблоны анкет, наборов документов, статей и групп базы знаний
 *
 * Подкомпоненты вынесены в ./project-template-editor/
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArrowLeft, Pencil, Check, X, Target } from 'lucide-react'
import {
  useProjectTemplateData,
  useProjectTemplateMutations,
  useDialogState,
  AddTemplatesDialog,
  AddKnowledgeDialog,
  ModulesSection,
  ProjectTemplateStatusesSection,
  ProjectTemplateFieldsSection,
} from './project-template-editor'
import { BriefTemplateSection } from './project-template-editor/BriefTemplateSection'
import { RootFolderSection } from './project-template-editor/RootFolderSection'
import { IconPicker } from '@/components/ui/icon-picker'
import { PROJECT_ICONS } from '@/components/ui/project-icons'

export function ProjectTemplateEditorPage() {
  const { workspaceId, templateId } = useParams<{ workspaceId: string; templateId: string }>()
  const router = useRouter()

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const dialogs = useDialogState()

  // Состояние редактирования названия
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [editedDescription, setEditedDescription] = useState('')

  // Загрузка данных
  const {
    template,
    linkedForms,
    linkedDocKits,
    linkedKnowledgeArticles,
    linkedKnowledgeGroups,
    availableFormsFiltered,
    availableDocKitsFiltered,
    isLoading,
  } = useProjectTemplateData({ workspaceId, templateId })

  // Мутации
  const {
    updateTemplateMutation,
    updateIconMutation,
    updateIsLeadTemplateMutation,
    updateModulesMutation,
    addFormsMutation,
    removeFormMutation,
    addDocKitsMutation,
    removeDocKitMutation,
    addKnowledgeArticlesMutation,
    removeKnowledgeArticleMutation,
    addKnowledgeGroupsMutation,
    removeKnowledgeGroupMutation,
  } = useProjectTemplateMutations({
    templateId,
    linkedForms,
    linkedDocKits,
    linkedKnowledgeArticles,
    linkedKnowledgeGroups,
    onNameSaved: () => setIsEditingName(false),
    onFormsAdded: dialogs.forms.close,
    onDocKitsAdded: dialogs.docKits.close,
    onKnowledgeArticlesAdded: dialogs.knowledge.close,
    onKnowledgeGroupsAdded: dialogs.knowledge.close,
  })

  // Обработчики
  const handleBack = () => {
    router.push(`/workspaces/${workspaceId}/settings/templates/project-templates`)
  }

  const handleStartEditingName = () => {
    if (!template) return
    setEditedName(template.name)
    setEditedDescription(template.description || '')
    setIsEditingName(true)
  }

  const handleSaveName = () => {
    if (!editedName.trim()) return
    updateTemplateMutation.mutate({ name: editedName, description: editedDescription })
  }

  const handleCancelEditingName = () => {
    setIsEditingName(false)
    setEditedName('')
    setEditedDescription('')
  }

  const handleToggleModule = (moduleId: string) => {
    const currentModules = template?.enabled_modules || []
    const newModules = currentModules.includes(moduleId)
      ? currentModules.filter((id: string) => id !== moduleId)
      : [...currentModules, moduleId]
    updateModulesMutation.mutate(newModules)
  }

  const handleRemoveWithConfirm = async (
    title: string,
    description: string,
    mutate: (id: string) => void,
    relationId: string,
  ) => {
    const ok = await confirm({ title, description, confirmText: 'Удалить', variant: 'destructive' })
    if (ok) mutate(relationId)
  }

  if (isLoading) {
    return (
      <WorkspaceLayout>
        <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
      </WorkspaceLayout>
    )
  }

  if (!template) {
    return (
      <WorkspaceLayout>
        <div className="p-8 text-center text-muted-foreground">Тип проекта не найден</div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="container max-w-6xl py-8 px-6">
        {/* Шапка */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к типам проектов
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Иконка шаблона — отображается в сайдбаре для всех проектов
                  этого типа. Цвет задаётся динамически от статуса каждого
                  конкретного проекта; здесь в редакторе показываем серым. */}
              <IconPicker
                value={template.icon}
                onChange={(iconId) => updateIconMutation.mutate(iconId)}
                disabled={updateIconMutation.isPending}
                icons={PROJECT_ICONS}
                color="#6B7280"
                label="Иконка в сайдбаре"
                popoverWidth={320}
                popoverMaxHeight={360}
              />

              <div className="flex-1 min-w-0 pt-7">
                {!isEditingName ? (
                  <>
                    <h1 className="text-3xl font-bold mb-2">{template.name}</h1>
                    {template.description && (
                      <p className="text-muted-foreground">{template.description}</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Название типа проекта"
                      className="text-2xl font-bold h-auto py-2"
                    />
                    <Input
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Описание (необязательно)"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isEditingName ? (
                <Button variant="outline" size="sm" onClick={handleStartEditingName}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Редактировать
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={handleCancelEditingName}>
                    <X className="w-4 h-4 mr-2" />
                    Отмена
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveName}
                    disabled={!editedName.trim() || updateTemplateMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Сохранить
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Флаг «это шаблон лида» — CRM-фрейм этап 3.
            Влияет на: воронку лидов в досках (этап 4), маршрутизацию
            входящих от новых контактов (этап 9), кнопку конверсии (этап 11). */}
        <div className="mb-6 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <Target className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <label
              htmlFor="is-lead-template"
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <Checkbox
                id="is-lead-template"
                checked={template.is_lead_template}
                disabled={updateIsLeadTemplateMutation.isPending}
                onCheckedChange={(checked) =>
                  updateIsLeadTemplateMutation.mutate(checked === true)
                }
              />
              <span className="text-sm font-medium">Это шаблон лида</span>
            </label>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">
              Проекты с этим шаблоном попадают в воронку продаж и могут быть конвертированы
              в рабочие проекты.
            </p>
          </div>
        </div>

        {/*
          Настройки шаблона разнесены на вкладки:
          - Модули — какие разделы доступны в проектах этого типа
          - Интеграции — корневая папка Drive и шаблон брифа Sheets
          - Статусы — воронка статусов шаблона
          - Поля — кастомные поля карточки проекта
        */}
        <Tabs defaultValue="modules" className="w-full">
          <TabsList>
            <TabsTrigger value="modules">Модули</TabsTrigger>
            <TabsTrigger value="integrations">Интеграции</TabsTrigger>
            <TabsTrigger value="statuses">Статусы</TabsTrigger>
            <TabsTrigger value="fields">Поля</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="mt-4">
            <ModulesSection
              workspaceId={workspaceId}
              projectTemplateId={templateId}
              enabledModules={template.enabled_modules || []}
              linkedForms={linkedForms}
              linkedDocKits={linkedDocKits}
              linkedKnowledgeArticles={linkedKnowledgeArticles}
              linkedKnowledgeGroups={linkedKnowledgeGroups}
              onToggleModule={handleToggleModule}
              onAddForms={dialogs.forms.open}
              onAddDocKits={dialogs.docKits.open}
              onAddKnowledge={dialogs.knowledge.open}
              onRemoveForm={(id) =>
                handleRemoveWithConfirm(
                  'Удалить шаблон анкеты?',
                  'Удалить этот шаблон анкеты из типа проекта?',
                  removeFormMutation.mutate,
                  id,
                )
              }
              onRemoveDocKit={(id) =>
                handleRemoveWithConfirm(
                  'Удалить шаблон набора документов?',
                  'Удалить этот шаблон набора документов из типа проекта?',
                  removeDocKitMutation.mutate,
                  id,
                )
              }
              onRemoveKnowledgeArticle={(id) =>
                handleRemoveWithConfirm(
                  'Удалить статью?',
                  'Удалить эту статью из типа проекта?',
                  removeKnowledgeArticleMutation.mutate,
                  id,
                )
              }
              onRemoveKnowledgeGroup={(id) =>
                handleRemoveWithConfirm(
                  'Удалить группу?',
                  'Удалить доступ ко всем статьям этой группы из типа проекта?',
                  removeKnowledgeGroupMutation.mutate,
                  id,
                )
              }
              isRemovingForm={removeFormMutation.isPending}
              isRemovingDocKit={removeDocKitMutation.isPending}
              isRemovingKnowledgeArticle={removeKnowledgeArticleMutation.isPending}
              isRemovingKnowledgeGroup={removeKnowledgeGroupMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="integrations" className="mt-4 space-y-6">
            <RootFolderSection
              templateId={templateId}
              rootFolderId={template.root_folder_id}
              workspaceId={workspaceId}
            />
            <BriefTemplateSection
              templateId={templateId}
              briefTemplateSheetId={template.brief_template_sheet_id}
              workspaceId={workspaceId}
            />
          </TabsContent>

          <TabsContent value="statuses" className="mt-4">
            <ProjectTemplateStatusesSection
              workspaceId={workspaceId}
              projectTemplateId={templateId}
            />
          </TabsContent>

          <TabsContent value="fields" className="mt-4">
            <ProjectTemplateFieldsSection
              workspaceId={workspaceId}
              projectTemplateId={templateId}
            />
          </TabsContent>
        </Tabs>

        {/* Диалоги добавления */}
        <AddTemplatesDialog
          open={dialogs.forms.isOpen}
          onOpenChange={dialogs.forms.setOpen}
          title="Добавить шаблоны анкет"
          description="Выберите шаблоны анкет, которые будут использоваться для этого типа проекта"
          emptyMessage="Все доступные шаблоны анкет уже добавлены"
          templates={availableFormsFiltered}
          selectedIds={dialogs.forms.selectedIds}
          onToggleSelection={dialogs.forms.toggle}
          onAdd={() => addFormsMutation.mutate(dialogs.forms.selectedIds)}
          onCancel={dialogs.forms.close}
          isPending={addFormsMutation.isPending}
        />

        <AddTemplatesDialog
          open={dialogs.docKits.isOpen}
          onOpenChange={dialogs.docKits.setOpen}
          title="Добавить шаблоны наборов документов"
          description="Выберите шаблоны наборов документов, которые будут использоваться для этого типа проекта"
          emptyMessage="Все доступные шаблоны наборов документов уже добавлены"
          templates={availableDocKitsFiltered}
          selectedIds={dialogs.docKits.selectedIds}
          onToggleSelection={dialogs.docKits.toggle}
          onAdd={() => addDocKitsMutation.mutate(dialogs.docKits.selectedIds)}
          onCancel={dialogs.docKits.close}
          isPending={addDocKitsMutation.isPending}
        />

        <AddKnowledgeDialog
          open={dialogs.knowledge.isOpen}
          onOpenChange={dialogs.knowledge.setOpen}
          workspaceId={workspaceId}
          linkedGroupIds={linkedKnowledgeGroups.map((g) => g.group_id)}
          linkedArticleIds={linkedKnowledgeArticles.map((a) => a.article_id)}
          onAdd={(groupIds, articleIds) => {
            if (groupIds.length > 0) addKnowledgeGroupsMutation.mutate(groupIds)
            if (articleIds.length > 0) addKnowledgeArticlesMutation.mutate(articleIds)
            dialogs.knowledge.close()
          }}
          onCancel={dialogs.knowledge.close}
          isPending={addKnowledgeGroupsMutation.isPending || addKnowledgeArticlesMutation.isPending}
        />

        <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      </div>
    </WorkspaceLayout>
  )
}
