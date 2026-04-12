/**
 * Общий каркас для диалогов редактирования ролей (workspace и project).
 * Содержит: Dialog → Header → name/description → children (секция прав) → Footer.
 */

import { type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { LucideIcon } from 'lucide-react'

interface RoleEditDialogBaseProps {
  open: boolean
  onClose: () => void
  onSave: () => void
  isSaving: boolean
  roleName: string
  roleColor: string | null
  icon: LucideIcon
  description: string
  name: string
  onNameChange: (name: string) => void
  roleDescription: string
  onDescriptionChange: (description: string) => void
  isSystem?: boolean
  children: ReactNode
}

export function RoleEditDialogBase({
  open,
  onClose,
  onSave,
  isSaving,
  roleName,
  roleColor,
  icon: Icon,
  description,
  name,
  onNameChange,
  roleDescription,
  onDescriptionChange,
  isSystem,
  children,
}: RoleEditDialogBaseProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" style={{ color: safeCssColor(roleColor) }} />
            Настройка роли «{roleName}»
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Название</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                disabled={isSystem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-description">Описание</Label>
              <Input
                id="role-description"
                value={roleDescription}
                onChange={(e) => onDescriptionChange(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {children}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
