'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateResidenceType, useUpdateResidenceType } from '@/lib/residence/mutations'
import type { ResidenceType, ResidenceTypeCategory } from '@/lib/residence/types'

/** Создание / редактирование вида ВНЖ. */
export function ResidenceTypeDialog({
  open, onOpenChange, countryId, residenceType,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
  /** Если задан — режим правки. */
  residenceType?: ResidenceType | null
}) {
  const isEdit = !!residenceType
  const [name, setName] = useState(residenceType?.name_ru ?? '')
  const [category, setCategory] = useState<ResidenceTypeCategory>(residenceType?.category ?? 'temporary')
  const [description, setDescription] = useState(residenceType?.description_ru ?? '')
  const [err, setErr] = useState<string | null>(null)

  const create = useCreateResidenceType(countryId)
  const update = useUpdateResidenceType(countryId)
  const busy = create.isPending || update.isPending

  const handleSave = async () => {
    setErr(null)
    if (!name.trim()) { setErr('Укажите название ВНЖ'); return }
    const payload = { name_ru: name.trim(), category, description_ru: description.trim() }
    try {
      if (residenceType) {
        await update.mutateAsync({ ...payload, id: residenceType.id })
      } else {
        await create.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Ошибка сохранения')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать вид ВНЖ' : 'Новый вид ВНЖ'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Цифровой кочевник" />
          </div>
          <div className="space-y-1.5">
            <Label>Категория</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ResidenceTypeCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="temporary">Временный ВНЖ</SelectItem>
                <SelectItem value="permanent">ПМЖ</SelectItem>
                <SelectItem value="citizenship">Гражданство</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
