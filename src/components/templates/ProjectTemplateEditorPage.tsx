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
import { PageLoader } from '@/components/ui/loaders'
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
  PanelTabsSection,
} from './project-template-editor'
import { BriefTemplateSection } from './project-template-editor/BriefTemplateSection'
import { RootFolderSection } from './project-template-editor/RootFolderSection'
import { FileSizeThresholdsSection } from './project-template-editor/FileSizeThresholdsSection'
import { TemplatePlanSection } from '@/components/plan/TemplatePlanSection'
import { IconPicker } from '@/components/ui/icon-picker'
import { ColorPicker } from '@/components/ui/color-picker'
import { Label } from '@/components/ui/label'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { PROJECT_ICONS } from '@/components/common/project-icons'

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
    updateIconColorModeMutation,
    updateIconColorMutation,
    updateIsLeadTemplateMutation,
    updateModulesMutation,
    addFormsMutation,
    removeFormMutation,
    reorderFormsMutation,
    addDocKitsMutation,
    removeDocKitMutation,
    reorderDocKitsMutation,
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
        <PageLoader />
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

          {/* Шапка: одна строка — иконка, название, карандаш. Описание (если
              есть) — отдельной строкой ниже. Все настройки иконки (выбор
              рисунка, режим цвета, фиксированный цвет) лежат внутри поповера
              самой иконки, чтобы не загромождать шапку. */}
          {!isEditingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <IconPicker
                  value={template.icon}
                  onChange={(iconId) => updateIconMutation.mutate(iconId)}
                  disabled={updateIconMutation.isPending}
                  icons={PROJECT_ICONS}
                  color={
                    template.icon_color_mode === 'fixed' ? template.icon_color : '#6B7280'
                  }
                  label=""
                  hideTriggerText
                  popoverWidth={340}
                  popoverMaxHeight={300}
                  popoverHeaderSlot={
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Цвет иконки</Label>
                      <div className="flex items-center gap-2">
                        <SegmentedToggle<'status' | 'fixed'>
                          value={template.icon_color_mode as 'status' | 'fixed'}
                          onChange={(v) => updateIconColorModeMutation.mutate(v)}
                          options={[
                            { value: 'status', label: 'По статусу' },
                            { value: 'fixed', label: 'Свой' },
                          ]}
                        />
                        {template.icon_color_mode === 'fixed' && (
                          <ColorPicker
                            value={template.icon_color}
                            onChange={(color) => updateIconColorMutation.mutate(color)}
                            disabled={updateIconColorMutation.isPending}
                            label=""
                            bareTrigger
                          />
                        )}
                      </div>
                    </div>
                  }
                />
                <h1 className="text-3xl font-bold flex-1 min-w-0 truncate">
                  {template.name}
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleStartEditingName}
                  title="Редактировать название и описание"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
              {template.description && (
                <p className="text-muted-foreground pl-1">{template.description}</p>
              )}
            </div>
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
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          )}
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
            <TabsTrigger value="panel-tabs">Боковая панель</TabsTrigger>
            <TabsTrigger value="plan">План</TabsTrigger>
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
              onReorderForms={(orderedIds) => reorderFormsMutation.mutate(orderedIds)}
              onReorderDocKits={(orderedIds) => reorderDocKitsMutation.mutate(orderedIds)}
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
            <FileSizeThresholdsSection
              templateId={templateId}
              warnMb={template.file_size_warn_mb}
              dangerMb={template.file_size_danger_mb}
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

          <TabsContent value="panel-tabs" className="mt-4">
            <PanelTabsSection
              workspaceId={workspaceId}
              projectTemplateId={templateId}
              enabledModules={template.enabled_modules || []}
              defaultPanelTabs={template.default_panel_tabs}
            />
          </TabsContent>

          <TabsContent value="plan" className="mt-4">
            <TemplatePlanSection
              workspaceId={workspaceId}
              templateId={templateId}
              enabledModules={template.enabled_modules || []}
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
