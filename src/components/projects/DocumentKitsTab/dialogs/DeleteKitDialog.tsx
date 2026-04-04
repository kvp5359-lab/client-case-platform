"use client"

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DeleteKitMode = 'delete_all' | 'move_to_unassigned'

interface DeleteKitDialogProps {
  open: boolean
  kitName: string
  onConfirm: (mode: DeleteKitMode) => void
  onCancel: () => void
}

const OPTIONS: { value: DeleteKitMode; label: string; description: string }[] = [
  {
    value: 'move_to_unassigned',
    label: 'Переместить в нераспределённые',
    description: 'Набор будет удалён, документы останутся в проекте на вкладке «Новые»',
  },
  {
    value: 'delete_all',
    label: 'Удалить набор и все документы',
    description: 'Набор и все документы в нём будут удалены безвозвратно',
  },
]

export function DeleteKitDialog({ open, kitName, onConfirm, onCancel }: DeleteKitDialogProps) {
  const [mode, setMode] = useState<DeleteKitMode | null>(null)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setMode(null)
      onCancel()
    }
  }

  const handleConfirm = () => {
    if (!mode) return
    const selected = mode
    setMode(null)
    onConfirm(selected)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить набор «{kitName}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Выберите, что сделать с документами набора.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-1 space-y-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={cn(
                'w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                mode === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 rounded-full border-2 items-center justify-center',
                  mode === opt.value ? 'border-primary' : 'border-muted-foreground/40',
                )}
              >
                {mode === opt.value && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="leading-snug">
                <span className="block font-medium text-sm">{opt.label}</span>
                <span className="block text-sm text-muted-foreground mt-0.5">
                  {opt.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel
            onClick={() => {
              setMode(null)
              onCancel()
            }}
          >
            Отмена
          </AlertDialogCancel>
          <Button
            disabled={!mode}
            variant={mode === 'delete_all' ? 'destructive' : 'default'}
            onClick={handleConfirm}
          >
            {mode === 'move_to_unassigned' ? 'Переместить и удалить набор' : 'Удалить'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
