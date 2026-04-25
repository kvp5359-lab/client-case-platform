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
import { ArrowLeft, Pencil, Check, X } from 'lucide-react'
import {
  useProjectTemplateData,
  useProjectTemplateMutations,
  useDialogState,
  AddTemplatesDialog,
  AddKnowledgeDialog,
  ModulesSection,
  ProjectTemplateStatusesSection,
} from './project-template-editor'
import { BriefTemplateSection } from './project-template-editor/BriefTemplateSection'
import { RootFolderSection } from './project-template-editor/RootFolderSection'

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
            {!isEditingName ? (
              <div>
                <h1 className="text-3xl font-bold mb-2">{template.name}</h1>
                {template.description && (
                  <p className="text-muted-foreground">{template.description}</p>
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-3">
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

        {/*
          Двухколоночный layout 50/50: слева — модули проекта, справа —
          настройки Google (корневая папка Drive, шаблон брифа Sheets).
          На экранах <lg колонки складываются в одну.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Левая колонка — модули */}
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

          {/* Правая колонка — интеграции с Google */}
          <div className="space-y-6">
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
          </div>
        </div>

        {/* Статусы шаблона проекта (наследуются проектами этого типа) */}
        <div className="mt-6">
          <ProjectTemplateStatusesSection
            workspaceId={workspaceId}
            projectTemplateId={templateId}
          />
        </div>

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
