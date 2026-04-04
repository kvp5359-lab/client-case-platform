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

interface CreateBriefDialogProps {
  open: boolean
  briefName: string
  isCreating: boolean
  onBriefNameChange: (name: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function CreateBriefDialog({
  open,
  briefName,
  isCreating,
  onBriefNameChange,
  onClose,
  onSubmit,
}: CreateBriefDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать бриф из шаблона</DialogTitle>
          <DialogDescription className="sr-only">
            Создание копии шаблона Google Таблицы для анкеты
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="brief-name">Название таблицы</Label>
            <Input
              id="brief-name"
              value={briefName}
              onChange={(e) => onBriefNameChange(e.target.value)}
              placeholder="Бриф — Название проекта"
            />
            <p className="text-xs text-muted-foreground">
              Копия шаблона будет создана с этим именем в папке проекта на Google Drive
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSubmit} disabled={!briefName.trim() || isCreating}>
            {isCreating ? 'Создание...' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
