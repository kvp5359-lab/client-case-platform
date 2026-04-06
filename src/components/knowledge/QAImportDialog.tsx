"use client"

/**
 * Диалог импорта Q&A из CSV-файла (формат экспорта Notion)
 */

import { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  NativeTable,
  NativeTableHead,
  NativeTableBody,
  NativeTableRow,
  NativeTableCell,
  NativeTableHeadCell,
} from '@/components/ui/native-table'
import { Upload, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { bulkCreateQA, reindexAllArticles } from '@/services/api/knowledge/knowledgeSearchService'
import { useAuth } from '@/contexts/AuthContext'
import {
  parseCSV,
  autoDetectMapping,
  tryParseDate,
  type ParsedCSV,
  type ColumnMapping,
  type MappableField,
} from '@/utils/files/csvParser'

interface QAImportDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'upload' | 'preview'

const fieldLabel: Record<MappableField, string> = {
  question: 'Вопрос',
  answer: 'Ответ',
  original_question: 'Исходный вопрос',
  original_answers: 'Исходные ответы',
  source: 'Источник',
  qa_date: 'Дата',
}

export function QAImportDialog({ workspaceId, open, onOpenChange }: QAImportDialogProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [isImporting, setIsImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const reset = useCallback(() => {
    setStep('upload')
    setFileName('')
    setParsed(null)
    setMapping({})
    setIsImporting(false)
    setDragOver(false)
  }, [])

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) reset()
      onOpenChange(value)
    },
    [onOpenChange, reset],
  )

  // --- Чтение файла ---

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Выберите CSV-файл')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) {
        toast.error('Файл пуст')
        return
      }
      const result = parseCSV(text)
      if (result.headers.length === 0 || result.rows.length === 0) {
        toast.error('Не удалось разобрать CSV — нет данных')
        return
      }
      setParsed(result)
      setMapping(autoDetectMapping(result.headers))
      setFileName(file.name)
      setStep('preview')
    }
    reader.onerror = () => toast.error('Ошибка чтения файла')
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  // --- Импорт ---

  const handleImport = useCallback(async () => {
    if (!parsed || !user) return

    const questionIdx = Object.entries(mapping).find(([, v]) => v === 'question')?.[0]
    const answerIdx = Object.entries(mapping).find(([, v]) => v === 'answer')?.[0]

    if (!questionIdx || !answerIdx) {
      toast.error('Не найдены колонки «Вопрос» и «Ответ»')
      return
    }

    const headerIndex = (header: string) => parsed.headers.indexOf(header)

    const items = parsed.rows
      .map((row) => {
        const item: Record<string, string | null> = {
          question: row[headerIndex(questionIdx)] ?? '',
          answer: row[headerIndex(answerIdx)] ?? '',
        }

        for (const [header, field] of Object.entries(mapping)) {
          if (!field || field === 'question' || field === 'answer') continue
          const val = row[headerIndex(header)]?.trim()
          if (!val) continue
          if (field === 'qa_date') {
            const parsed = tryParseDate(val)
            if (parsed) item[field] = parsed
          } else {
            item[field] = val
          }
        }

        return item
      })
      .filter((item) => item.question && item.answer)

    if (items.length === 0) {
      toast.error('Нет строк с заполненными вопросом и ответом')
      return
    }

    setIsImporting(true)
    try {
      const { created } = await bulkCreateQA(
        items as Array<{ question: string; answer: string } & Record<string, string | null>>,
        workspaceId,
        user.id,
      )

      let remaining = 1
      while (remaining > 0) {
        const result = await reindexAllArticles(workspaceId)
        remaining = result.remaining
      }

      await queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.qa(workspaceId) })

      toast.success(`Импортировано ${created} записей`)
      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка импорта')
    } finally {
      setIsImporting(false)
    }
  }, [parsed, mapping, user, workspaceId, queryClient, handleOpenChange])

  // --- Превью ---

  const previewRows = parsed?.rows.slice(0, 5) ?? []
  const mappedHeaders = parsed?.headers.filter((h) => mapping[h]) ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Импорт Q&A из CSV</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className={`flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Перетащите CSV-файл или нажмите для выбора</p>
              <p className="text-xs text-muted-foreground mt-1">
                Формат CSV: Вопрос, Ответ, Исходный вопрос, Исходные ответы, Источник, Дата
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{fileName}</span>
              <span className="text-xs">
                ({parsed.rows.length} строк, {mappedHeaders.length} полей распознано)
              </span>
            </div>

            <div className="overflow-auto border rounded-md max-h-[400px]">
              <NativeTable>
                <NativeTableHead>
                  <NativeTableRow isHeader>
                    {mappedHeaders.map((h) => (
                      <NativeTableHeadCell key={h}>{fieldLabel[mapping[h]!]}</NativeTableHeadCell>
                    ))}
                  </NativeTableRow>
                </NativeTableHead>
                <NativeTableBody>
                  {previewRows.map((row, i) => (
                    <NativeTableRow key={i}>
                      {mappedHeaders.map((h) => {
                        const idx = parsed.headers.indexOf(h)
                        const value = row[idx] ?? ''
                        return (
                          <NativeTableCell key={h} className="max-w-[200px] truncate" title={value}>
                            {value}
                          </NativeTableCell>
                        )
                      })}
                    </NativeTableRow>
                  ))}
                </NativeTableBody>
              </NativeTable>
            </div>

            {previewRows.length < parsed.rows.length && (
              <p className="text-xs text-muted-foreground text-center">
                Показаны первые 5 из {parsed.rows.length} строк
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-4">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={reset} disabled={isImporting}>
                Назад
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Импорт...
                  </>
                ) : (
                  `Импортировать ${parsed?.rows.length ?? 0} записей`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
