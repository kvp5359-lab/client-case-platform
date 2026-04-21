import { FileText, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AttachedDocument } from '@/hooks/messenger/useMessengerAi'

interface Props {
  attachedDocuments: AttachedDocument[]
  removeAttachedDocument: (id: string) => void
  disabled?: boolean
}

export function AttachedDocumentsBadges({
  attachedDocuments,
  removeAttachedDocument,
  disabled,
}: Props) {
  if (attachedDocuments.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1 mb-1">
      {attachedDocuments.map((doc) => (
        <Badge
          key={doc.id}
          variant="secondary"
          className="pl-1.5 pr-0.5 py-0 gap-1 text-[11px] h-6 shrink-0 bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200"
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[120px]">{doc.name}</span>
          <button
            type="button"
            onClick={() => removeAttachedDocument(doc.id)}
            className="ml-0.5 hover:bg-purple-300/50 rounded p-0.5"
            disabled={disabled}
            aria-label={`Убрать ${doc.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
    </div>
  )
}
