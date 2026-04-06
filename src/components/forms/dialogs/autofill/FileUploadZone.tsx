"use client"

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, FileText, ArrowLeft, X } from 'lucide-react'
import { formatSize } from '@/utils/files/formatSize'
import { AUTOFILL_SUPPORTED_MIME_TYPES } from '@/utils/files/fileValidation'
import { AUTOFILL_AI_WARNING } from './types'

interface FileUploadZoneProps {
  file: File | null
  onFileSelect: (file: File | null) => void
  onAnalyze: () => void
  onBack: () => void
}

export function FileUploadZone({ file, onFileSelect, onAnalyze, onBack }: FileUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateAndSelect = useCallback(
    (selectedFile: File) => {
      if (!AUTOFILL_SUPPORTED_MIME_TYPES.includes(selectedFile.type)) {
        toast.warning('Неподдерживаемый формат файла. Используйте PDF, JPG или PNG')
        return
      }

      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast.error('Файл слишком большой. Максимальный размер: 10 МБ')
        return
      }

      onFileSelect(selectedFile)
    },
    [onFileSelect],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        validateAndSelect(droppedFile)
      }
    },
    [validateAndSelect],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        validateAndSelect(selectedFile)
      }
    },
    [validateAndSelect],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const triggerFileSelect = () => fileInputRef.current?.click()

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Зона загрузки файла. Перетащите файл или нажмите для выбора"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={triggerFileSelect}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              triggerFileSelect()
            }
          }}
          className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer"
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm font-medium mb-2">Перетащите файл сюда или нажмите для выбора</p>
          <p className="text-xs text-muted-foreground mb-4">Поддерживаются: PDF, JPG, PNG</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileInput}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              triggerFileSelect()
            }}
            type="button"
          >
            Выбрать файл
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{file.name}</div>
              <div className="text-sm text-muted-foreground">{formatSize(file.size)}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onFileSelect(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Alert>
        <AlertDescription className="text-sm">
          ⚠️ Документ НЕ будет сохранён в проект. Используется только для автозаполнения
        </AlertDescription>
      </Alert>

      <Alert>
        <AlertDescription className="text-sm">{AUTOFILL_AI_WARNING}</AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        <Button onClick={onAnalyze} disabled={!file} className="flex-1">
          Анализировать
        </Button>
      </div>
    </div>
  )
}
