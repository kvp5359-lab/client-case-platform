"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useAddFormKit } from './add-form-kit/useAddFormKit'
import { TemplateStep } from './add-form-kit/TemplateStep'
import { GoogleSheetStep } from './add-form-kit/GoogleSheetStep'

interface AddFormKitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
  onKitCreated?: (kitId: string) => void
  templateFormIds?: string[]
  googleDriveFolderLink?: string | null
  projectName?: string
}

export function AddFormKitDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  onKitCreated,
  templateFormIds = [],
  googleDriveFolderLink,
  projectName,
}: AddFormKitDialogProps) {
  const {
    mode,
    setMode,
    googleSheetSubMode,
    setGoogleSheetSubMode,
    templates,
    loadingTemplates,
    selectedTemplateId,
    existingKitTemplateIds,
    sheetName,
    setSheetName,
    sheetLink,
    setSheetLink,
    sheetFileName,
    briefName,
    setBriefName,
    briefTemplateLink,
    handleBriefTemplateLinkChange,
    briefTemplateSheetName,
    selectedFolderId,
    setSelectedFolderId,
    handleTemplateToggle,
    handleCreate,
    isCreateDisabled,
    isPending,
    hasBriefTemplate,
  } = useAddFormKit({
    open,
    projectId,
    workspaceId,
    templateFormIds,
    googleDriveFolderLink,
    projectName,
    onOpenChange,
    onKitCreated,
  })

  const buttonLabel =
    mode === 'template'
      ? 'Создать анкету'
      : googleSheetSubMode === 'existing'
        ? 'Подключить таблицу'
        : 'Создать бриф'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить анкету</DialogTitle>
          <DialogDescription>
            Выберите шаблон анкеты или подключите Google Таблицу
          </DialogDescription>
        </DialogHeader>

        {/* Переключатель режима */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === 'template'
                ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Из шаблона
          </button>
          <button
            type="button"
            onClick={() => setMode('google-sheet')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === 'google-sheet'
                ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Google Таблица
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {mode === 'template' ? (
            <TemplateStep
              templates={templates}
              loadingTemplates={loadingTemplates}
              selectedTemplateId={selectedTemplateId}
              existingKitTemplateIds={existingKitTemplateIds}
              templateFormIds={templateFormIds}
              onToggle={handleTemplateToggle}
            />
          ) : (
            <GoogleSheetStep
              subMode={googleSheetSubMode}
              onSubModeChange={setGoogleSheetSubMode}
              sheetName={sheetName}
              sheetLink={sheetLink}
              sheetFileName={sheetFileName}
              onSheetNameChange={setSheetName}
              onSheetLinkChange={setSheetLink}
              hasBriefTemplate={hasBriefTemplate}
              briefName={briefName}
              onBriefNameChange={setBriefName}
              briefTemplateLink={briefTemplateLink}
              onBriefTemplateLinkChange={handleBriefTemplateLinkChange}
              briefTemplateSheetName={briefTemplateSheetName}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              googleDriveFolderLink={googleDriveFolderLink}
              workspaceId={workspaceId}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={isCreateDisabled}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
