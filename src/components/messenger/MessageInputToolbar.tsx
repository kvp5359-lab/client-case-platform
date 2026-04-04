import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Send, Save } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { MessengerAccent } from './MessageBubble'
import { MessengerToolbar } from './MinimalTiptapEditor'
import { AttachmentButton } from './AttachmentButton'
import { QuickReplyPicker } from './QuickReplyPicker'

export const sendButtonStyles: Record<string, string> = {
  blue: 'bg-blue-500 hover:bg-blue-600 text-white',
  slate: 'bg-stone-600 hover:bg-stone-700 text-white',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  amber: 'bg-amber-500 hover:bg-amber-600 text-white',
  rose: 'bg-rose-500 hover:bg-rose-600 text-white',
  violet: 'bg-violet-600 hover:bg-violet-700 text-white',
  orange: 'bg-orange-500 hover:bg-orange-600 text-white',
  cyan: 'bg-cyan-600 hover:bg-cyan-700 text-white',
  pink: 'bg-pink-500 hover:bg-pink-600 text-white',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  // Legacy
  green: 'bg-green-600 hover:bg-green-700 text-white',
  dark: 'bg-stone-600 hover:bg-stone-700 text-white',
}

interface MessageInputToolbarProps {
  editor: Editor | null
  projectId: string
  workspaceId: string
  totalFiles: number
  hasContent: boolean
  isPending: boolean
  isSavingDraft?: boolean
  showSaveDraft: boolean
  openQuickReplyPicker: boolean
  accent: MessengerAccent
  onFilesSelected: (files: File[]) => void
  onOpenDocPicker?: () => void
  projectDocumentsCount: number
  onQuickReplyPickerHandled: () => void
  onSend: () => void
  onSaveDraft: () => void
}

export function MessageInputToolbar({
  editor,
  projectId,
  workspaceId,
  totalFiles,
  hasContent,
  isPending,
  isSavingDraft,
  showSaveDraft,
  openQuickReplyPicker,
  accent,
  onFilesSelected,
  onOpenDocPicker,
  projectDocumentsCount,
  onQuickReplyPickerHandled,
  onSend,
  onSaveDraft,
}: MessageInputToolbarProps) {
  return (
    <div className="flex items-center pb-2 pt-0">
      {/* Left: attach + separator + quick reply + separator + formatting toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 flex-1 min-w-0">
        <AttachmentButton
          onFilesSelected={onFilesSelected}
          onOpenDocPicker={onOpenDocPicker}
          projectDocumentsCount={projectDocumentsCount}
          disabled={isPending}
          multiple
          buttonClassName="h-8 w-8 text-muted-foreground hover:text-foreground"
          iconClassName="h-4 w-4"
          badge={totalFiles}
        />
        <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />
        {editor && (
          <QuickReplyPicker
            editor={editor}
            projectId={projectId}
            workspaceId={workspaceId}
            externalOpen={openQuickReplyPicker}
            onExternalOpenHandled={onQuickReplyPickerHandled}
          />
        )}
        {editor && <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />}
        {editor && <MessengerToolbar editor={editor} />}
      </div>
      {/* Right: save + send */}
      <div className="flex items-center gap-1 pr-1.5">
        {showSaveDraft && (
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={!hasContent || isPending || isSavingDraft}
            onClick={onSaveDraft}
            title="Сохранить черновик"
          >
            <Save className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          className={cn('h-8 w-8', sendButtonStyles[accent] ?? sendButtonStyles.blue)}
          disabled={!hasContent || isPending}
          onClick={onSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
