import { useState } from 'react'
import { Loader2, FolderOpen, FileText, ChevronRight } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDocumentKitsQuery } from '@/hooks/documents/useDocumentKitsQuery'
import type { MessageAttachment } from '@/services/api/messenger/messengerService'
import { useQueryClient } from '@tanstack/react-query'
import { documentKitKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import { createDocumentFromAttachment } from '@/services/documents/documentService'
import { triggerTextExtraction } from '@/services/documents/textExtractionService'

type AddToProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  attachment: MessageAttachment
  projectId: string
  workspaceId: string
}

export function AddToProjectDialog({
  open,
  onOpenChange,
  attachment,
  projectId,
  workspaceId,
}: AddToProjectDialogProps) {
  const { data: kits, isLoading } = useDocumentKitsQuery(open ? projectId : undefined)
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  const handleSelectFolder = async (kitId: string, folderId: string | null) => {
    if (saving) return
    setSaving(true)
    try {
      const newDoc = await createDocumentFromAttachment(attachment, {
        name: attachment.file_name.replace(/\.[^/.]+$/, ''),
        kitId,
        folderId,
        projectId,
        workspaceId,
      })

      queryClient.invalidateQueries({ queryKey: documentKitKeys.byProject(projectId) })
      triggerTextExtraction(newDoc.id)

      toast.success('Документ добавлен в проект')
      onOpenChange(false)
    } catch {
      toast.error('Не удалось добавить документ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить к документам проекта</DialogTitle>
        </DialogHeader>

        {saving && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Добавляем документ...</span>
          </div>
        )}

        {!saving && isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!saving && !isLoading && (!kits || kits.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-8">
            В проекте нет наборов документов
          </p>
        )}

        {!saving && !isLoading && kits && kits.length > 0 && (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-3">
              {kits.map((kit) => {
                const folders = kit.folders ?? []
                if (folders.length === 0) return null
                return (
                  <div key={kit.id}>
                    <p className="text-base font-bold text-foreground uppercase tracking-wide mb-1 px-1">
                      {kit.name}
                    </p>
                    <div className="-space-y-px">
                      <button
                        type="button"
                        onClick={() => handleSelectFolder(kit.id, null)}
                        className="flex items-center gap-2 w-full px-3 py-1 rounded-lg text-left hover:bg-accent transition-colors group"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 truncate">Без группы</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                      <Separator className="!my-1 bg-gray-200" />
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => handleSelectFolder(kit.id, folder.id)}
                          className="flex items-center gap-2 w-full px-3 py-1 rounded-lg text-left hover:bg-accent transition-colors group"
                        >
                          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm flex-1 truncate">{folder.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
