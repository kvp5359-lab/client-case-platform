"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { autofillKeys } from '@/hooks/queryKeys'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileText, Image as ImageIcon, ArrowLeft, Loader2 } from 'lucide-react'
import { formatSize } from '@/utils/files/formatSize'
import { Tables } from '@/types/database'
import { AUTOFILL_SUPPORTED_MIME_TYPES } from '@/utils/files/fileValidation'
import { AUTOFILL_AI_WARNING } from './types'

type Document = Tables<'documents'> & {
  document_files: Tables<'document_files'>[]
}

interface ProjectDocumentsListProps {
  projectId: string
  selectedDocumentId: string | null
  onSelect: (documentId: string) => void
  onAnalyze: () => void
  onBack: () => void
  /** B-161: visually disable button while analysis is starting */
  isAnalyzing?: boolean
}

export function ProjectDocumentsList({
  projectId,
  selectedDocumentId,
  onSelect,
  onAnalyze,
  onBack,
  isAnalyzing = false,
}: ProjectDocumentsListProps) {
  const {
    data: documents = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: autofillKeys.projectDocuments(projectId),
    queryFn: async () => {
      const { data, error: loadError } = await supabase
        .from('documents')
        .select('*, document_files(*)')
        .eq('project_id', projectId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (loadError) throw loadError
      return (data ?? []) as Document[]
    },
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  })

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-blue-500" />
    }
    return <FileText className="w-5 h-5 text-red-500" />
  }

  const getSupportedFile = (doc: Document) => {
    const files = doc.document_files || []
    const currentFile = files.find((f) => f.is_current)
    if (!currentFile) return null

    if (AUTOFILL_SUPPORTED_MIME_TYPES.includes(currentFile.mime_type)) {
      return currentFile
    }
    return null
  }

  const supportedDocuments = documents.filter((doc) => getSupportedFile(doc))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить документы</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onBack} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
      </div>
    )
  }

  if (supportedDocuments.length === 0) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            В проекте нет документов подходящего формата (PDF, JPG, PNG)
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onBack} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-2">
        {supportedDocuments.map((doc) => {
          const file = getSupportedFile(doc)
          if (!file) return null
          const isSelected = selectedDocumentId === doc.id

          return (
            <button
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                isSelected ? 'bg-primary/10 border-primary' : 'hover:bg-muted border-transparent'
              }`}
            >
              {getFileIcon(file.mime_type)}
              <div className="flex-1 text-left">
                <div className="font-medium text-sm">{doc.name}</div>
                <div className="text-xs text-muted-foreground">{formatSize(file.file_size)}</div>
              </div>
              {isSelected && (
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      <Alert>
        <AlertDescription className="text-sm">{AUTOFILL_AI_WARNING}</AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        <Button
          onClick={onAnalyze}
          disabled={!selectedDocumentId || isAnalyzing}
          className="flex-1"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Анализ...
            </>
          ) : (
            'Анализировать'
          )}
        </Button>
      </div>
    </div>
  )
}
