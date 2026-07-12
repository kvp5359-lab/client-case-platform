import { FileText, Pencil } from 'lucide-react'
import { stripHtml } from '@/utils/format/messengerHtml'
import type { QuickReply } from '@/hooks/quick-replies/useQuickReplies'

// --- Строка шаблона быстрого ответа с иконкой редактирования при ховере ---

export function QuickReplyRow({
  reply,
  idx,
  activeIndex,
  indent,
  onSelect,
  onEdit,
}: {
  reply: QuickReply & { group_name?: string }
  idx: number
  activeIndex: number
  indent: boolean
  onSelect: (content: string) => void
  onEdit: (e: React.MouseEvent, reply: QuickReply) => void
}) {
  const isActive = activeIndex === idx

  return (
    <div
      data-idx={idx}
      className={`qr-row group relative flex items-center min-w-0 ${indent ? 'pl-7' : 'pl-3'} pr-3 py-1 transition-colors cursor-pointer overflow-hidden ${isActive ? 'bg-accent' : 'hover:bg-accent'}`}
      onClick={() => onSelect(reply.content)}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-2" />
      <span className="text-sm font-medium shrink-0 mr-1 max-w-[40%] truncate">{reply.name}</span>
      {reply.content && (
        <span className="text-xs text-muted-foreground truncate">{stripHtml(reply.content)}</span>
      )}
      {/* Кнопка редактирования — поверх текста справа с градиентным fade */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center pr-1.5 pl-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
        style={{ background: 'linear-gradient(to right, transparent, var(--color-accent) 40%)' }}
      >
        <button
          type="button"
          onClick={(e) => onEdit(e, reply)}
          className="p-1 rounded hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground"
          title="Редактировать шаблон"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
