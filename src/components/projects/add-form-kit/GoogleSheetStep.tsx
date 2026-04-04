"use client"

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { BriefTemplateStep } from './BriefTemplateStep'
import type { GoogleSheetSubMode } from './useAddFormKit'

interface GoogleSheetStepProps {
  subMode: GoogleSheetSubMode
  onSubModeChange: (mode: GoogleSheetSubMode) => void
  // Existing sheet props
  sheetName: string
  sheetLink: string
  sheetFileName: string | null
  onSheetNameChange: (value: string) => void
  onSheetLinkChange: (value: string) => void
  // Brief template props
  hasBriefTemplate: boolean
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

export function GoogleSheetStep({
  subMode,
  onSubModeChange,
  sheetName,
  sheetLink,
  sheetFileName,
  onSheetNameChange,
  onSheetLinkChange,
  hasBriefTemplate,
  briefName,
  onBriefNameChange,
  briefTemplateLink,
  onBriefTemplateLinkChange,
  briefTemplateSheetName,
  selectedFolderId,
  onSelectFolder,
  googleDriveFolderLink,
  workspaceId,
}: GoogleSheetStepProps) {
  return (
    <div className="space-y-4 py-2">
      {/* Sub-mode switcher — only show if brief template available */}
      {hasBriefTemplate && (
        <SegmentedToggle
          options={[
            { value: 'existing' as const, label: 'Подключить существующую' },
            { value: 'from-template' as const, label: 'Создать копию из шаблона' },
          ]}
          value={subMode}
          onChange={onSubModeChange}
        />
      )}

      {subMode === 'existing' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="sheet-url">Ссылка на Google Таблицу</Label>
            <Input
              id="sheet-url"
              value={sheetLink}
              onChange={(e) => onSheetLinkChange(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            {sheetFileName && <p className="text-xs text-brand-600 font-medium">{sheetFileName}</p>}
            <p className="text-xs text-muted-foreground">
              Таблица будет отображаться встроенным виджетом на вкладке «Анкеты»
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sheet-name">Название анкеты</Label>
            <Input
              id="sheet-name"
              value={sheetName}
              onChange={(e) => onSheetNameChange(e.target.value)}
              placeholder="Например: Бриф клиента"
            />
          </div>
        </>
      ) : (
        <BriefTemplateStep
          briefName={briefName}
          onBriefNameChange={onBriefNameChange}
          briefTemplateLink={briefTemplateLink}
          onBriefTemplateLinkChange={onBriefTemplateLinkChange}
          briefTemplateSheetName={briefTemplateSheetName}
          selectedFolderId={selectedFolderId}
          onSelectFolder={onSelectFolder}
          googleDriveFolderLink={googleDriveFolderLink}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
