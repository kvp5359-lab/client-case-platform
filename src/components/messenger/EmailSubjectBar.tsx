/**
 * Displays email subject/contact info bar above the message list
 */

interface EmailSubjectBarProps {
  subject?: string | null
  contactEmail?: string | null
}

export function EmailSubjectBar({ subject, contactEmail }: EmailSubjectBarProps) {
  if (subject) {
    return (
      <div className="px-4 py-1.5 border-b bg-red-50/50 flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">Тема:</span>
        <span className="text-xs font-medium text-red-700 truncate">{subject}</span>
        {contactEmail && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">→ {contactEmail}</span>
        )}
      </div>
    )
  }

  if (contactEmail) {
    return (
      <div className="px-4 py-1.5 border-b bg-red-50/50 flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">Email:</span>
        <span className="text-xs font-medium text-red-700">{contactEmail}</span>
      </div>
    )
  }

  return null
}
