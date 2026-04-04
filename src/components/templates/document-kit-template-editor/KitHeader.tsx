/**
 * KitHeader — заголовок шаблона с редактированием
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Pencil, Check, X } from 'lucide-react'
import { DocumentKitTemplate } from './types'

interface KitHeaderProps {
  kit: DocumentKitTemplate
  isPending: boolean
  onSave: (data: { name: string; description: string }) => Promise<void> | void
}

export function KitHeader({ kit, isPending, onSave }: KitHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(kit.name)
  const [editedDescription, setEditedDescription] = useState(kit.description || '')

  // Синхронизация при изменении kit
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEditedName(kit.name)
    setEditedDescription(kit.description || '')
  }, [kit])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStartEditing = () => {
    setEditedName(kit.name)
    setEditedDescription(kit.description || '')
    setIsEditing(true)
  }

  const handleCancelEditing = () => {
    setIsEditing(false)
    setEditedName(kit.name)
    setEditedDescription(kit.description || '')
  }

  const handleSaveEditing = async () => {
    if (!editedName.trim()) return
    try {
      await onSave({
        name: editedName,
        description: editedDescription,
      })
      setIsEditing(false)
    } catch {
      // Ошибка обрабатывается в onSave — форма остаётся открытой
    }
  }

  return (
    <Card>
      <CardHeader>
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-name" className="text-sm font-medium">
                Название
              </Label>
              <Input
                id="edit-name"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Название набора"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="edit-description" className="text-sm font-medium">
                Описание
              </Label>
              <Input
                id="edit-description"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Описание набора"
                className="mt-1.5"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEditing} disabled={isPending}>
                <Check className="w-4 h-4 mr-2" />
                Сохранить
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEditing}
                disabled={isPending}
              >
                <X className="w-4 h-4 mr-2" />
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl">{kit.name}</CardTitle>
              {kit.description && (
                <CardDescription className="mt-2">{kit.description}</CardDescription>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleStartEditing}>
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}
