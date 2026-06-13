/**
 * Диалог настроек секции шаблона анкеты: имя, описание, цвет заголовка.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  SECTION_HEADER_COLORS,
  DEFAULT_SECTION_HEADER_COLOR,
} from '@/components/forms/sectionColors'
import type { FormSectionWithDetails } from '../types'

type SectionSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  section: FormSectionWithDetails
  onSave: (data: { name: string; description: string; headerColor: string | null }) => void
}

export function SectionSettingsDialog(props: SectionSettingsDialogProps) {
  // key по section.id + флагу open — пересоздаёт внутренний стейт при открытии
  // и смене секции, без useEffect-каскадов.
  const { open, onOpenChange } = props
  if (!open) {
    return <Dialog open={open} onOpenChange={onOpenChange} />
  }
  return <SectionSettingsDialogInner key={props.section.id} {...props} />
}

function SectionSettingsDialogInner({
  open,
  onOpenChange,
  section,
  onSave,
}: SectionSettingsDialogProps) {
  const [name, setName] = useState(section.name)
  const [description, setDescription] = useState(section.description || '')
  const [color, setColor] = useState(section.header_color || DEFAULT_SECTION_HEADER_COLOR)

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim(),
      headerColor: color === DEFAULT_SECTION_HEADER_COLOR ? null : color,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки секции</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="section-name">Название</Label>
            <Input
              id="section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название секции"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="section-description">Описание</Label>
            <Textarea
              id="section-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткий пояснительный текст под заголовком секции"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Цвет фона заголовка</Label>
            <ColorPicker
              label=""
              value={color}
              presetColors={SECTION_HEADER_COLORS}
              onChange={setColor}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
