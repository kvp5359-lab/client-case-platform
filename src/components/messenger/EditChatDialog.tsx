/**
 * Диалог редактирования чата — название, акцентный цвет, иконка.
 */

import { useState } from 'react'
import { Hash } from 'lucide-react'
import { ACCENT_COLORS, THREAD_ICONS } from './threadConstants'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ThreadAccentColor, ProjectThread } from '@/hooks/messenger/useProjectThreads'

/** Получить React-компонент иконки по строковому имени */
export function getChatIconComponent(iconName: string) {
  return THREAD_ICONS.find((i) => i.value === iconName)?.icon ?? Hash
}

/** Получить accent bg class для вкладки чата */
export function getChatTabAccent(accentColor: ThreadAccentColor): {
  active: string
  badge: string
} {
  const map: Record<ThreadAccentColor, { active: string; badge: string }> = {
    blue: { active: 'bg-blue-50 text-blue-600', badge: 'bg-blue-600' },
    slate: { active: 'bg-white text-stone-900', badge: 'bg-stone-600' },
    emerald: { active: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-600' },
    amber: { active: 'bg-amber-50 text-amber-700', badge: 'bg-amber-500' },
    rose: { active: 'bg-red-50 text-red-600', badge: 'bg-red-500' },
    violet: { active: 'bg-violet-50 text-violet-600', badge: 'bg-violet-600' },
    orange: { active: 'bg-orange-50 text-orange-600', badge: 'bg-orange-500' },
    cyan: { active: 'bg-cyan-50 text-cyan-700', badge: 'bg-cyan-600' },
    pink: { active: 'bg-pink-50 text-pink-600', badge: 'bg-pink-500' },
    indigo: { active: 'bg-indigo-50 text-indigo-600', badge: 'bg-indigo-600' },
  }
  return map[accentColor] ?? map.blue
}

interface EditChatDialogProps {
  chat: ProjectThread | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (params: { name: string; accent_color: ThreadAccentColor; icon: string }) => void
  isPending?: boolean
}

export function EditChatDialog({
  chat,
  open,
  onOpenChange,
  onSave,
  isPending,
}: EditChatDialogProps) {
  // Reset state when chat changes by using chat.id as key-like mechanism
  const chatId = chat?.id ?? ''
  const [name, setName] = useState(chat?.name ?? '')
  const [accentColor, setAccentColor] = useState<ThreadAccentColor>(chat?.accent_color ?? 'blue')
  const [icon, setIcon] = useState(chat?.icon ?? 'message-square')

  // Reset when different chat is opened — useMemo-based reset
  const [prevChatId, setPrevChatId] = useState(chatId)
  if (chatId !== prevChatId) {
    setPrevChatId(chatId)
    setName(chat?.name ?? '')
    setAccentColor(chat?.accent_color ?? 'blue')
    setIcon(chat?.icon ?? 'message-square')
  }

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), accent_color: accentColor, icon })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Изменить чат</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* Название */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-chat-name">Название</Label>
            <Input
              id="edit-chat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) handleSave()
              }}
            />
          </div>

          {/* Акцентный цвет */}
          <div className="flex flex-col gap-1.5">
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setAccentColor(color.value)}
                  title={color.label}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all',
                    color.bg,
                    accentColor === color.value
                      ? `ring-2 ring-offset-2 ${color.ring}`
                      : 'hover:scale-110',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Иконка */}
          <div className="flex flex-col gap-1.5">
            <Label>Иконка</Label>
            <div className="flex flex-wrap gap-1.5">
              {THREAD_ICONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIcon(opt.value)}
                  title={opt.label}
                  className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center transition-colors',
                    icon === opt.value
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'hover:bg-muted text-muted-foreground',
                  )}
                >
                  <opt.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
