/**
 * Диалог создания/редактирования справочника
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DIRECTORY_PRESET_COLORS } from '@/types/customDirectories'
import type { CustomDirectory } from '@/types/customDirectories'

interface DirectoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: CustomDirectory | null
  onSave: (data: { name: string; description?: string; icon?: string; color?: string }) => void
  saving: boolean
}

export function DirectoryFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
  saving,
}: DirectoryFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <DirectoryFormBody
            key={editing?.id ?? 'create'}
            editing={editing}
            onSave={onSave}
            saving={saving}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DirectoryFormBody({
  editing,
  onSave,
  saving,
  onClose,
}: {
  editing: CustomDirectory | null
  onSave: DirectoryFormDialogProps['onSave']
  saving: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [color, setColor] = useState(editing?.color ?? '#3B82F6')

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), description: description.trim() || undefined, color })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Редактировать справочник' : 'Новый справочник'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Измените параметры справочника'
            : 'Создайте новый справочник для хранения данных'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="dir-name">Название *</Label>
          <Input
            id="dir-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Юристы"
            disabled={saving}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dir-description">Описание</Label>
          <Input
            id="dir-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание справочника"
            disabled={saving}
          />
        </div>

        <ColorPicker
          value={color}
          onChange={setColor}
          disabled={saving}
          presetColors={DIRECTORY_PRESET_COLORS}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Сохранение...' : editing ? 'Сохранить' : 'Создать'}
        </Button>
      </DialogFooter>
    </>
  )
}
