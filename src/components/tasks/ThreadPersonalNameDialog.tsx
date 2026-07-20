"use client"

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMyThreadName, useSetThreadUserName } from '@/hooks/useThreadUserNames'

type Props = {
  threadId: string
  /** Общее имя треда — как плейсхолдер (что покажется после сброса). */
  sharedName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Диалог «Назвать для себя»: личное имя треда (видит только текущий пользователь). */
export function ThreadPersonalNameDialog({ threadId, sharedName, open, onOpenChange }: Props) {
  const current = useMyThreadName(threadId)
  const setName = useSetThreadUserName()
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  // Инициализируем поле текущим личным именем при открытии (render-time adjust,
  // без эффекта — чтобы не ловить react-hooks/set-state-in-effect).
  // Пока пользователь не начал печатать, поле следует за `current` — на случай,
  // если личное имя догрузилось уже после открытия диалога.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    setTouched(false)
    if (open) setValue(current ?? '')
  } else if (open && !touched && value !== (current ?? '')) {
    setValue(current ?? '')
  }

  const save = async (name: string | null) => {
    await setName.mutateAsync({ threadId, name })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Назвать для себя</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={value}
            onChange={(e) => { setTouched(true); setValue(e.target.value) }}
            placeholder={sharedName}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void save(value) }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Видно только вам. Пусто или «Сбросить» — вернётся общее имя.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button" variant="ghost" size="sm"
            disabled={!current || setName.isPending}
            onClick={() => void save(null)}
          >
            Сбросить
          </Button>
          <Button type="button" size="sm" disabled={setName.isPending} onClick={() => void save(value)}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
