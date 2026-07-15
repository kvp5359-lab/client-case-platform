/**
 * Комментарий к шаблону в строке списка: вертикальная черта и приглушённый текст
 * после названия. Внутренняя пометка «чем отличается от одноимённых» —
 * клиенту не показывается.
 *
 * Один компонент на все списки (шаблоны папок/слотов и их пикеры), чтобы вид
 * пометки правился в одном месте.
 */

import { cn } from '@/lib/utils'

type CommentNoteProps = {
  comment: string | null | undefined
  className?: string
}

export function CommentNote({ comment, className }: CommentNoteProps) {
  if (!comment) return null

  return (
    <>
      <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
      <span className={cn('text-xs text-muted-foreground truncate', className)}>{comment}</span>
    </>
  )
}
