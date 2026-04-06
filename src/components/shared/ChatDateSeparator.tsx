import { formatSmartDate } from '@/utils/format/dateFormat'

export function ChatDateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground/70 font-medium">
        {formatSmartDate(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
