"use client"

/**
 * Диалог создания папок набора документов на Google Drive (двухшаговый мастер).
 *
 * Если у проекта ещё нет папки на Google Drive — предлагает создать её
 * (переиспользует механизм кнопки «Подключить папку» из настроек проекта).
 *
 * Шаг 1 — куда: выбор папки деревом (DriveFolderTreePicker) + создание новой
 *          папки внутри выбранной.
 * Шаг 2 — подпапки: список секций набора (переименование, нумерация вкл/выкл +
 *          начальный номер, удаление лишних) и кнопка «Создать подпапки».
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Loader2, X, Plus, FolderOpen } from 'lucide-react'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { DriveFolderTreePicker } from '@/components/google-drive/DriveFolderTreePicker'
import { useDriveFoldersWizard } from './useDriveFoldersWizard'

type CreateDriveFoldersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kit: DocumentKitWithDocuments | null
  googleDriveFolderLink: string | null | undefined
  workspaceId: string
  /** Создать корневую папку проекта (если ещё не подключена). Из настроек проекта. */
  onCreateProjectFolder?: (folderName: string) => Promise<void>
  /** Есть ли корневая папка типа проекта — без неё создать папку проекта нельзя. */
  rootFolderId?: string | null
  /** Подсказка имени для новой папки проекта. */
  defaultProjectFolderName?: string | null
}

export function CreateDriveFoldersDialog({
  open,
  onOpenChange,
  kit,
  googleDriveFolderLink,
  workspaceId,
  onCreateProjectFolder,
  rootFolderId,
  defaultProjectFolderName,
}: CreateDriveFoldersDialogProps) {
  const {
    step,
    setStep,
    showNewFolderInput,
    setShowNewFolderInput,
    newFolderName,
    setNewFolderName,
    reloadKey,
    selectedFolderId,
    numbered,
    startNumber,
    subItems,
    targetFolder,
    isCreatingTarget,
    isCreatingSubs,
    projectFolderName,
    setProjectFolderName,
    isCreatingProjectFolder,
    projectFolderId,
    validNames,
    handleConnectProjectFolder,
    handleSelectTarget,
    handleCreateTargetFolder,
    handleToggleNumbered,
    handleStartNumberChange,
    handleFolderNameChange,
    handleRemoveFolder,
    handleCreateSubfolders,
  } = useDriveFoldersWizard({
    open,
    kit,
    googleDriveFolderLink,
    workspaceId,
    onCreateProjectFolder,
    defaultProjectFolderName,
    onOpenChange,
  })

  if (!kit) return null

  // --- Папка проекта не подключена: предложить создать ---
  if (!projectFolderId) {
    const canCreateProjectFolder = !!onCreateProjectFolder && !!rootFolderId
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Создать папки на Google Drive</DialogTitle>
            <DialogDescription className="sr-only">
              Подключение папки проекта на Google Drive
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              У проекта ещё нет папки на Google Drive.{' '}
              {canCreateProjectFolder
                ? 'Создайте её — после этого можно будет добавлять подпапки.'
                : 'Подключите её в настройках проекта: вкладка «Настройки» → «Интеграции».'}
            </p>

            {canCreateProjectFolder && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Название папки проекта</Label>
                <Input
                  value={projectFolderName}
                  onChange={(e) => setProjectFolderName(e.target.value)}
                  placeholder="Название папки проекта"
                  autoFocus
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            {canCreateProjectFolder && (
              <Button
                onClick={handleConnectProjectFolder}
                disabled={!projectFolderName.trim() || isCreatingProjectFolder}
              >
                {isCreatingProjectFolder ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать папку проекта'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Создать папки на Google Drive</DialogTitle>
          <DialogDescription className="sr-only">
            Создание структуры папок набора документов на Google Drive
          </DialogDescription>
        </DialogHeader>

        {/* Степпер */}
        <div className="flex items-center gap-2 text-xs">
          {([1, 2] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border" />}
              <span
                className={cn(
                  'flex items-center gap-1.5',
                  step === s ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                    step === s ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {s}
                </span>
                {s === 1 ? 'Куда' : 'Подпапки'}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-5 py-2 overflow-y-auto flex-1 min-h-0">
          {/* Шаг 1: куда создавать */}
          {step === 1 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Куда создать подпапки</Label>

              <DriveFolderTreePicker
                workspaceId={workspaceId}
                projectFolderId={projectFolderId}
                selectedFolderId={selectedFolderId}
                onSelect={handleSelectTarget}
                reloadKey={reloadKey}
              />

              {showNewFolderInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Название новой папки"
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateTargetFolder}
                    disabled={!newFolderName.trim() || isCreatingTarget}
                  >
                    {isCreatingTarget ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowNewFolderInput(false)}
                    disabled={isCreatingTarget}
                  >
                    Отмена
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewFolderInput(true)}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {targetFolder
                    ? `Новая папка в «${targetFolder.name}»`
                    : 'Новая папка в корне проекта'}
                </Button>
              )}

              <p className="text-xs text-muted-foreground">
                {targetFolder
                  ? `Подпапки будут созданы в папке «${targetFolder.name}».`
                  : 'Выберите папку выше — в неё попадут подпапки.'}
              </p>
            </div>
          )}

          {/* Шаг 2: Подпапки */}
          {step === 2 && targetFolder && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 truncate">{targetFolder.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setStep(1)}
              >
                Изменить
              </Button>
            </div>
          )}

          {step === 2 && subItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  Подпапки для создания ({validNames.length})
                </Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="numbered"
                      checked={numbered}
                      onCheckedChange={handleToggleNumbered}
                    />
                    <Label htmlFor="numbered" className="text-xs text-muted-foreground">
                      Нумерация
                    </Label>
                  </div>
                  {numbered && (
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="start-number" className="text-xs text-muted-foreground">
                        Начать с
                      </Label>
                      <Input
                        id="start-number"
                        type="number"
                        min={0}
                        value={startNumber}
                        onChange={(e) => handleStartNumberChange(e.target.value)}
                        className="h-8 w-16 text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="max-h-[45vh] overflow-y-auto space-y-1.5">
                {subItems.map((item) => (
                  <div key={item.id} className="group relative">
                    <Input
                      value={item.name}
                      onChange={(e) => handleFolderNameChange(item.id, e.target.value)}
                      className="h-8 text-sm pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(item.id)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      title="Удалить из списка"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={() => setStep(2)} disabled={!targetFolder}>
                Далее
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Назад
              </Button>
              <Button
                onClick={handleCreateSubfolders}
                disabled={!targetFolder || isCreatingSubs || validNames.length === 0}
              >
                {isCreatingSubs ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать подпапки'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
