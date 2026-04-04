import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IndexingStatusBadge } from './components/IndexingStatusBadge'

// ---------- Helpers ----------

export function truncate(str: string, max: number) {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

// ---------- Indexing status icon ----------

export function IndexingStatusIcon({ status }: { status: string }) {
  return <IndexingStatusBadge status={status} variant="qa" />
}

// ---------- Table columns ----------

export const COLUMNS = [
  { key: 'question', width: 'auto' },
  { key: 'groups', width: '130px' },
  { key: 'tags', width: '130px' },
  { key: 'source', width: '90px' },
  { key: 'date', width: '80px' },
  { key: 'status', width: '40px' },
  { key: 'actions', width: '36px' },
]

// ---------- Delete confirmation dialog ----------

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
  questionPreview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isDeleting: boolean
  questionPreview: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить Q&A?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Вы уверены, что хотите удалить &laquo;{truncate(questionPreview, 60)}&raquo;? Это действие
          нельзя отменить.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
