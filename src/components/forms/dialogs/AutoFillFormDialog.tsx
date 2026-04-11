"use client"

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentSourceSelector } from './autofill/DocumentSourceSelector'
import { ProjectDocumentsList } from './autofill/ProjectDocumentsList'
import { FileUploadZone } from './autofill/FileUploadZone'
import { AnalysisProgress } from './autofill/AnalysisProgress'
import { AutoFillResults } from './autofill/AutoFillResults'
import type { ExtractionResult } from './autofill/types'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'

interface AutoFillFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formKitId: string
  projectId: string
  workspaceId: string
  onApply: (extractedData: Record<string, string>) => Promise<void>
}

type Step = 'source' | 'select-document' | 'upload-file' | 'analyzing' | 'results'
type Source = 'project' | 'upload' | null

export function AutoFillFormDialog({
  open,
  onOpenChange,
  formKitId,
  projectId,
  workspaceId,
  onApply,
}: AutoFillFormDialogProps) {
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<Source>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const isAnalyzingRef = useRef(false)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Очистка интервала при unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [])

  // Сброс состояния при закрытии
  const handleClose = () => {
    setStep('source')
    setSource(null)
    setSelectedDocumentId(null)
    setUploadedFile(null)
    setAnalysisProgress(0)
    setResult(null)
    setIsApplying(false)
    isAnalyzingRef.current = false
    setIsAnalyzing(false)
    onOpenChange(false)
  }

  // Выбор источника
  const handleSourceSelect = (selectedSource: 'project' | 'upload') => {
    setSource(selectedSource)
    if (selectedSource === 'project') {
      setStep('select-document')
    } else {
      setStep('upload-file')
    }
  }

  // Выбор документа из проекта
  const handleDocumentSelect = (documentId: string) => {
    setSelectedDocumentId(documentId)
  }

  // Загрузка файла
  const handleFileUpload = (file: File | null) => {
    setUploadedFile(file)
  }

  // Начать анализ
  const handleStartAnalysis = async () => {
    if (isAnalyzingRef.current) return
    isAnalyzingRef.current = true
    setIsAnalyzing(true)

    setStep('analyzing')
    setAnalysisProgress(0)

    // Очищаем предыдущий интервал при двойном нажатии
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Симуляция прогресса
    progressIntervalRef.current = setInterval(() => {
      setAnalysisProgress((prev) => {
        if (prev >= 90) return 90
        return prev + 10
      })
    }, 500)

    try {
      let response

      if (source === 'project' && selectedDocumentId) {
        // Анализ документа из проекта
        response = await supabase.functions.invoke('extract-form-data', {
          body: {
            document_id: selectedDocumentId,
            form_kit_id: formKitId,
            workspace_id: workspaceId,
          },
        })
      } else if (source === 'upload' && uploadedFile) {
        // Анализ загруженного файла
        const formData = new FormData()
        formData.append('file', uploadedFile)
        formData.append('form_kit_id', formKitId)
        formData.append('workspace_id', workspaceId)

        response = await supabase.functions.invoke('extract-form-data-from-file', {
          body: formData,
        })
      }

      setAnalysisProgress(100)
      if (!response) {
        throw new Error('Не удалось выполнить анализ: источник документа не выбран')
      }
      if (response.error) {
        throw new Error(response.error.message || 'Failed to extract data')
      }

      const data = response.data
      if (data?.error) {
        throw new Error(data.error)
      }
      setResult(data as ExtractionResult)
      setStep('results')
    } catch (error) {
      logger.error('Analysis error:', error)
      toast.error('Ошибка анализа', {
        description: error instanceof Error ? error.message : 'Не удалось извлечь данные',
      })
      handleClose()
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      isAnalyzingRef.current = false
      setIsAnalyzing(false)
    }
  }

  // Применить результаты
  const handleApplyResults = async () => {
    if (!result) return

    setIsApplying(true)
    try {
      // Конвертировать объекты в строки
      const stringifiedData: Record<string, string> = {}
      Object.entries(result.extracted_data).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          stringifiedData[key] = ''
          return
        }
        stringifiedData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
      })
      await onApply(stringifiedData)
      toast.success('Данные применены', {
        description: `Заполнено ${result.stats.filled} из ${result.stats.total} полей`,
      })
      handleClose()
    } catch (error) {
      logger.error('Apply error:', error)
      toast.error('Ошибка', {
        description: 'Не удалось применить данные',
      })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'source' && 'Автозаполнение из документа'}
            {step === 'select-document' && 'Выберите документ'}
            {step === 'upload-file' && 'Загрузите документ'}
            {step === 'analyzing' && 'Анализ документа'}
            {step === 'results' && 'Результаты автозаполнения'}
          </DialogTitle>
        </DialogHeader>

        {step === 'source' && <DocumentSourceSelector onSelect={handleSourceSelect} />}

        {step === 'select-document' && (
          <ProjectDocumentsList
            projectId={projectId}
            selectedDocumentId={selectedDocumentId}
            onSelect={handleDocumentSelect}
            onAnalyze={handleStartAnalysis}
            onBack={() => setStep('source')}
            isAnalyzing={isAnalyzing}
          />
        )}

        {step === 'upload-file' && (
          <FileUploadZone
            file={uploadedFile}
            onFileSelect={handleFileUpload}
            onAnalyze={handleStartAnalysis}
            onBack={() => setStep('source')}
          />
        )}

        {step === 'analyzing' && (
          <AnalysisProgress
            progress={analysisProgress}
            fileName={uploadedFile?.name || selectedDocumentId || 'Документ'}
          />
        )}

        {step === 'results' && result && (
          <AutoFillResults
            result={result}
            formKitId={formKitId}
            onApply={handleApplyResults}
            onCancel={handleClose}
            isApplying={isApplying}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
