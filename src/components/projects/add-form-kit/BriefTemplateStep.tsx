"use client"

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { DriveFolderTreePicker } from '@/components/google-drive/DriveFolderTreePicker'

type BriefTemplateStepProps = {
  briefName: string
  onBriefNameChange: (value: string) => void
  briefTemplateLink: string
  onBriefTemplateLinkChange: (value: string) => void
  briefTemplateSheetName: string | null
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  googleDriveFolderLink: string | null | undefined
  workspaceId: string
}

export function BriefTemplateStep({
  briefName,
  onBriefNameChange,
  briefTemplateLink,
  onBriefTemplateLinkChange,
  briefTemplateSheetName,
  selectedFolderId,
  onSelectFolder,
  googleDriveFolderLink,
  workspaceId,
}: BriefTemplateStepProps) {
  const projectFolderId = googleDriveFolderLink
    ? extractGoogleDriveFolderId(googleDriveFolderLink)
    : null

  return (
    <div className="space-y-4">
      {/* Template sheet link */}
      <div className="space-y-2">
        <Label htmlFor="brief-tpl-link">Ссылка на таблицу-шаблон</Label>
        <Input
          id="brief-tpl-link"
          value={briefTemplateLink}
          onChange={(e) => onBriefTemplateLinkChange(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
        {briefTemplateSheetName && (
          <p className="text-xs text-brand-600 font-medium">{briefTemplateSheetName}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Будет создана копия этой таблицы. Можно вставить другую ссылку.
        </p>
      </div>

      {/* Brief name */}
      <div className="space-y-2">
        <Label htmlFor="brief-tpl-name">Название копии</Label>
        <Input
          id="brief-tpl-name"
          value={briefName}
          onChange={(e) => onBriefNameChange(e.target.value)}
          placeholder="Бриф — Название проекта"
        />
      </div>

      {!projectFolderId ? (
        <p className="text-xs text-muted-foreground">
          К проекту не подключена папка Google Drive — бриф будет создан в корне вашего диска
        </p>
      ) : (
        <div className="space-y-2">
          <Label>Папка на Google Drive</Label>
          <DriveFolderTreePicker
            workspaceId={workspaceId}
            projectFolderId={projectFolderId}
            selectedFolderId={selectedFolderId}
            onSelect={(folder) => onSelectFolder(folder.id)}
            autoSelectRoot
            maxHeightClassName="max-h-[200px]"
          />
          <p className="text-xs text-muted-foreground">Копия будет создана в выбранной папке</p>
        </div>
      )}
    </div>
  )
}
