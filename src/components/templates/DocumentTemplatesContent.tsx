/**
 * DocumentTemplatesContent — управление DOCX-шаблонами для генерации документов.
 *
 * Позволяет загружать Word-шаблоны с плейсхолдерами, привязывать их к полям анкет,
 * и затем генерировать заполненные документы из данных проекта.
 */

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Search, Plus, FileText, Trash2, Settings2, Upload } from 'lucide-react'
import {
  useDocumentTemplates,
  useUpdateDocumentTemplate,
  useReplaceDocumentTemplateFile,
  useDeleteDocumentTemplate,
} from '@/hooks/documents/useDocumentTemplates'
import type { DocumentTemplate } from '@/services/api/documents/documentTemplateService'
import { formatSize } from '@/utils/files/formatSize'
import { PlaceholderMappingDialog } from './PlaceholderMappingDialog'
import { UploadTemplateDialog } from './UploadTemplateDialog'

export function DocumentTemplatesContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: templates = [], isLoading } = useDocumentTemplates(workspaceId)
  const updateMutation = useUpdateDocumentTemplate()
  const replaceMutation = useReplaceDocumentTemplateFile()
  const deleteMutation = useDeleteDocumentTemplate()

  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [replaceTemplateId, setReplaceTemplateId] = useState<string | null>(null)

  // Inline-редактирование названия
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const [searchQuery, setSearchQuery] = useState('')
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [mappingTemplate, setMappingTemplate] = useState<DocumentTemplate | null>(null)

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleStartRename = (template: DocumentTemplate) => {
    setEditingId(template.id)
    setEditingName(template.name)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const handleSaveRename = () => {
    const trimmed = editingName.trim()
    if (editingId && trimmed && trimmed !== templates.find((t) => t.id === editingId)?.name) {
      updateMutation.mutate({ id: editingId, updates: { name: trimmed } })
    }
    setEditingId(null)
  }

  const handleReplaceClick = (templateId: string) => {
    setReplaceTemplateId(templateId)
    replaceInputRef.current?.click()
  }

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !replaceTemplateId || !workspaceId) return

    await replaceMutation.mutateAsync({
      templateId: replaceTemplateId,
      file,
      workspaceId,
    })

    setReplaceTemplateId(null)
    // Сбросить input чтобы можно было выбрать тот же файл снова
    if (replaceInputRef.current) replaceInputRef.current.value = ''
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить шаблон документа?',
      description: 'Удалить этот шаблон документа?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(id)
  }

  return (
    <>
      {/* Шапка с поиском и кнопкой */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => setIsUploadDialogOpen(true)}
          className="bg-brand-400 hover:bg-brand-500 text-black"
        >
          <Plus className="w-4 h-4 mr-2" />
          Загрузить шаблон
        </Button>
      </div>

      {/* Таблица шаблонов */}
      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery
              ? 'Ничего не найдено'
              : 'Пока нет шаблонов документов. Загрузите первый DOCX-файл с плейсхолдерами!'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Название</TableHead>
                <TableHead>Файл</TableHead>
                <TableHead className="text-center">Плейсхолдеры</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.map((template) => {
                const placeholders = (template.placeholders || []) as Array<{
                  name: string
                  field_definition_id: string | null
                }>
                const mappedCount = placeholders.filter((p) => p.field_definition_id).length
                const totalCount = placeholders.length

                return (
                  <TableRow key={template.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          {editingId === template.id ? (
                            <Input
                              ref={editInputRef}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={handleSaveRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename()
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="h-7 text-sm font-medium"
                              autoFocus
                            />
                          ) : (
                            <p
                              className="font-medium cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => handleStartRename(template)}
                              title="Нажмите, чтобы переименовать"
                            >
                              {template.name}
                            </p>
                          )}
                          {template.description && (
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="truncate max-w-[200px]">{template.file_name}</p>
                        <p className="text-muted-foreground">
                          {template.file_size ? formatSize(template.file_size) : '—'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {totalCount > 0 ? (
                        <span
                          className={
                            mappedCount === totalCount ? 'text-green-600' : 'text-amber-600'
                          }
                        >
                          {mappedCount}/{totalCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleReplaceClick(template.id)}
                          disabled={replaceMutation.isPending}
                          title="Заменить файл"
                        >
                          <Upload className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setMappingTemplate(template)}
                          title="Настроить плейсхолдеры"
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(template.id)}
                          disabled={deleteMutation.isPending}
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Диалог загрузки */}
      {workspaceId && (
        <UploadTemplateDialog
          open={isUploadDialogOpen}
          onOpenChange={setIsUploadDialogOpen}
          workspaceId={workspaceId}
        />
      )}

      {/* Диалог маппинга плейсхолдеров */}
      {mappingTemplate && (
        <PlaceholderMappingDialog
          template={mappingTemplate}
          workspaceId={workspaceId!}
          open={!!mappingTemplate}
          onOpenChange={(open) => {
            if (!open) setMappingTemplate(null)
          }}
        />
      )}

      {/* Скрытый input для замены файла шаблона */}
      <input
        ref={replaceInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleReplaceFileChange}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
