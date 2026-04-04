"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ConnectBriefDialogProps {
  open: boolean
  sheetLink: string
  isConnecting: boolean
  onSheetLinkChange: (link: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function ConnectBriefDialog({
  open,
  sheetLink,
  isConnecting,
  onSheetLinkChange,
  onClose,
  onSubmit,
}: ConnectBriefDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подключить существующий бриф</DialogTitle>
          <DialogDescription className="sr-only">
            Подключение существующей Google Таблицы к анкете
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sheet-link">Ссылка на Google Таблицу</Label>
            <Input
              id="sheet-link"
              value={sheetLink}
              onChange={(e) => onSheetLinkChange(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <p className="text-xs text-muted-foreground">
              Таблица будет отображаться вместо стандартной анкеты
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={!sheetLink.trim() || isConnecting}>
            {isConnecting ? 'Подключение...' : 'Подключить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
