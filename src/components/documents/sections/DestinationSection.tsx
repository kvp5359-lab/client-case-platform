"use client"

/**
 * Секция папки назначения (Google Drive)
 * TODO (Z3-03): Collapsible-обёртка дублируется 4 раза — рефакторинг на BaseSection
 */

import { memo } from 'react'
import { CollapsedSection } from './CollapsedSection'
import { RefreshCw, Upload } from 'lucide-react'
import { DestinationDocumentRow } from '../DestinationDocumentRow'
import { SystemSectionTable } from '../SystemSectionTable'
import type { DestinationDocument } from '../types'

interface DestinationSectionProps {
  documents: DestinationDocument[]
  isCollapsed: boolean
  isExporting: boolean
  isFetchingDestination: boolean
  hasExported: boolean
  exportPhase: 'idle' | 'cleaning' | 'uploading' | 'completed'
}

export const DestinationSection = memo(function DestinationSection({
  documents,
  isCollapsed,
  isExporting,
  isFetchingDestination,
  hasExported,
  exportPhase,
}: DestinationSectionProps) {
  // Показываем прогресс загрузки/экспорта
  if (isExporting || isFetchingDestination) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div className="text-center text-muted-foreground text-sm py-8">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" />
            {isFetchingDestination ? (
              <p>Загрузка состава папки...</p>
            ) : exportPhase === 'cleaning' ? (
              <p>🗑️ Очистка целевой папки...</p>
            ) : exportPhase === 'uploading' ? (
              <p>📤 Выгрузка документов...</p>
            ) : exportPhase === 'completed' ? (
              <p>✅ Выгрузка завершена!</p>
            ) : (
              <p>Выгрузка документов...</p>
            )}
            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  exportPhase === 'completed' ? 'bg-green-500' : 'bg-green-500 animate-pulse'
                }`}
                style={{
                  width:
                    exportPhase === 'cleaning'
                      ? '30%'
                      : exportPhase === 'uploading'
                        ? '70%'
                        : exportPhase === 'completed'
                          ? '100%'
                          : '50%',
                }}
              />
            </div>
          </div>
        </div>
      </CollapsedSection>
    )
  }

  // Ещё не экспортировали
  if (!hasExported && documents.length === 0) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div className="text-center text-muted-foreground text-sm py-8">
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p>Нажмите ⬆️ "Отправить в Drive" для синхронизации</p>
          </div>
        </div>
      </CollapsedSection>
    )
  }

  // Папка пуста
  if (documents.length === 0) {
    return (
      <CollapsedSection isCollapsed={isCollapsed}>
        <div className="text-center text-muted-foreground text-sm py-4">
          Папка на Google Drive пуста
        </div>
      </CollapsedSection>
    )
  }

  // Список документов
  return (
    <CollapsedSection isCollapsed={isCollapsed}>
      <SystemSectionTable>
        {documents.map((file) => (
          <DestinationDocumentRow key={file.id} file={file} />
        ))}
      </SystemSectionTable>
    </CollapsedSection>
  )
})
