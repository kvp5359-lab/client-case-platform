import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Upload } from 'lucide-react'
import { useUploadDocumentTemplate } from '@/hooks/documents/useDocumentTemplates'

interface UploadTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function UploadTemplateDialog({
  open,
  onOpenChange,
  workspaceId,
}: UploadTemplateDialogProps) {
  const uploadMutation = useUploadDocumentTemplate()

  const [uploadName, setUploadName] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    await uploadMutation.mutateAsync({
      file: uploadFile,
      name: uploadName,
      description: uploadDescription || undefined,
      workspaceId,
    })

    onOpenChange(false)
    setUploadName('')
    setUploadDescription('')
    setUploadFile(null)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setUploadName('')
      setUploadDescription('')
      setUploadFile(null)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Загрузить шаблон документа</DialogTitle>
          <DialogDescription>
            Загрузите Word-файл (.docx) с плейсхолдерами вида {'{{имя_поля}}'}. После загрузки вы
            сможете привязать плейсхолдеры к полям анкет.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="docx-file">DOCX-файл *</Label>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="docx-file"
                  className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {uploadFile ? uploadFile.name : 'Выберите файл'}
                </label>
                <input
                  id="docx-file"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setUploadFile(file)
                      if (!uploadName) {
                        setUploadName(file.name.replace(/\.docx$/i, ''))
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-name">Название *</Label>
              <Input
                id="template-name"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="Например: Договор купли-продажи"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-description">Описание</Label>
              <Textarea
                id="template-description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Краткое описание шаблона"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!uploadFile || !uploadName || uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Загрузка...' : 'Загрузить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
