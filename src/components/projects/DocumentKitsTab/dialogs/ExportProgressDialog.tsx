import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExportDocumentStatus = 'pending' | 'uploading' | 'success' | 'error'

export interface ExportDocument {
  documentId: string
  fileName: string
  folderName?: string
  status: ExportDocumentStatus
  progress?: number
  error?: string
}

interface ExportProgressDialogProps {
  open: boolean
  phase: 'cleaning' | 'uploading' | 'completed'
  cleaningProgress?: number
  documents: ExportDocument[]
  onClose?: () => void
}

export function ExportProgressDialog({
  open,
  phase,
  cleaningProgress,
  documents,
  onClose,
}: ExportProgressDialogProps) {
  // Группируем документы по папкам с сохранением порядка
  const groupedDocuments = documents.reduce(
    (acc, doc) => {
      const folderKey = doc.folderName || '__root__'
      if (!acc[folderKey]) {
        acc[folderKey] = []
      }
      acc[folderKey].push(doc)
      return acc
    },
    {} as Record<string, ExportDocument[]>,
  )

  // Получаем уникальные папки в порядке появления документов
  const folders = Array.from(new Set(documents.map((d) => d.folderName || '__root__')))

  const totalDocuments = documents.length
  const completedDocuments = documents.filter(
    (d) => d.status === 'success' || d.status === 'error',
  ).length

  const getStatusIcon = (status: ExportDocumentStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'uploading':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />
    }
  }

  const canClose = phase === 'completed' && onClose

  return (
    <Dialog open={open} onOpenChange={canClose ? onClose : undefined}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => !canClose && e.preventDefault()}
        onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Выгрузка на Google Диск</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Фаза очистки */}
          {phase === 'cleaning' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">Очистка целевой папки...</span>
              </div>
              {cleaningProgress !== undefined && (
                <div className="space-y-2">
                  <Progress value={cleaningProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">{cleaningProgress}%</p>
                </div>
              )}
            </div>
          )}

          {/* Фаза загрузки */}
          {(phase === 'uploading' || phase === 'completed') && (
            <div className="space-y-4">
              {/* Общий прогресс */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Выгрузка документов</span>
                  <span className="text-muted-foreground">
                    {completedDocuments} из {totalDocuments}
                  </span>
                </div>
                <Progress
                  value={totalDocuments > 0 ? (completedDocuments / totalDocuments) * 100 : 0}
                  className="h-2"
                />
              </div>

              {/* Список документов по папкам */}
              <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                {folders.map((folderKey) => {
                  const folderDocs = groupedDocuments[folderKey]
                  const displayFolderName = folderKey === '__root__' ? 'Без папки' : folderKey

                  return (
                    <div key={folderKey} className="space-y-2">
                      {/* Название папки */}
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span>📁 {displayFolderName}</span>
                      </div>

                      {/* Документы в папке */}
                      <div className="space-y-1.5 ml-6">
                        {folderDocs.map((doc) => (
                          <div
                            key={doc.documentId}
                            className={cn(
                              'flex items-center gap-2 text-sm p-2 rounded',
                              doc.status === 'error' && 'bg-destructive/10',
                            )}
                          >
                            {getStatusIcon(doc.status)}
                            <span className="flex-1 truncate">{doc.fileName}</span>
                            {doc.status === 'uploading' && doc.progress !== undefined && (
                              <span className="text-xs text-muted-foreground">{doc.progress}%</span>
                            )}
                            {doc.status === 'error' && doc.error && (
                              <span className="text-xs text-destructive truncate max-w-[200px]">
                                {doc.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Сообщение о завершении */}
              {phase === 'completed' && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Выгрузка завершена</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
