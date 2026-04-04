import { FileChipRow, getFileIcon } from './ComposeField'
import type { ForwardedAttachment } from '@/services/api/messengerService'

interface ExistingAttachment {
  id: string
  file_name: string
  storage_path: string
  file_id: string
}

interface MessageAttachmentsRowProps {
  existingAttachments: ExistingAttachment[]
  files: File[]
  forwardedAttachments: ForwardedAttachment[]
  onRemoveExisting: (index: number) => void
  onRemoveFile: (index: number) => void
  onRemoveForwarded?: (index: number) => void
}

export function MessageAttachmentsRow({
  existingAttachments,
  files,
  forwardedAttachments,
  onRemoveExisting,
  onRemoveFile,
  onRemoveForwarded,
}: MessageAttachmentsRowProps) {
  return (
    <div className="flex flex-wrap gap-1 px-4 py-1">
      {existingAttachments.map((att, i) => {
        const fi = getFileIcon(att.file_name)
        return (
          <FileChipRow
            key={`existing-${att.id}`}
            name={att.file_name}
            Icon={fi.icon}
            iconColor={fi.color}
            onRemove={() => onRemoveExisting(i)}
            storagePath={att.storage_path}
            fileId={att.file_id}
          />
        )
      })}
      {files.map((file, i) => {
        const fi = getFileIcon(file.name)
        return (
          <FileChipRow
            key={`${file.name}-${i}`}
            name={file.name}
            Icon={fi.icon}
            iconColor={fi.color}
            onRemove={() => onRemoveFile(i)}
            localFile={file}
          />
        )
      })}
      {forwardedAttachments.map((att, i) => {
        const fi = getFileIcon(att.file_name)
        return (
          <FileChipRow
            key={`fwd-${att.file_id}-${i}`}
            name={att.file_name}
            Icon={fi.icon}
            iconColor={fi.color}
            onRemove={onRemoveForwarded ? () => onRemoveForwarded(i) : undefined}
            storagePath={att.storage_path}
            fileId={att.file_id}
          />
        )
      })}
    </div>
  )
}
