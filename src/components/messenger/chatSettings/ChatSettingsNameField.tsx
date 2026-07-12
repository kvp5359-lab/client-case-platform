import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { ChatSettingsIconColorPicker } from '../ChatSettingsIconColorPicker'
import { ChatSettingsStatusPopover } from '../ChatSettingsStatusPopover'
import type { useChatSettingsFormState } from '../hooks/useChatSettingsFormState'
import type { useChatSettingsActions } from '../hooks/useChatSettingsActions'

type Form = ReturnType<typeof useChatSettingsFormState>
type Actions = ReturnType<typeof useChatSettingsActions>

/**
 * Блок «Название + Описание» (Gmail-стиль: единая рамка, статус-точка слева,
 * иконка/цвет справа, описание ниже за разделителем). Держит собственные refs,
 * автофокус названия и авто-рост описания. Вынесено из ChatSettingsDialog
 * (аудит 2026-07-13).
 */
export function ChatSettingsNameField({
  form,
  actions,
  open,
}: {
  form: Form
  actions: Actions
  open: boolean
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const [descFocused, setDescFocused] = useState(false)

  // Автофокус названия: каретка и прокрутка в НАЧАЛО, иначе у длинного названия
  // input показывает его конец.
  useEffect(() => {
    if (!open) return
    if (!(form.isEditMode || form.channelType !== 'email')) return
    const id = requestAnimationFrame(() => {
      const el = nameRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(0, 0)
      el.scrollLeft = 0
    })
    return () => cancelAnimationFrame(id)
  }, [open, form.isEditMode, form.channelType])

  const growDescription = () => {
    const el = descRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 128), 256)}px`
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <Label htmlFor="chat-name" className="text-sm text-muted-foreground">
        Название
        {!form.isEditMode && form.channelType === 'email' && (
          <span className="text-muted-foreground font-normal ml-1">(опционально)</span>
        )}
      </Label>
      <div className="rounded-md border border-input bg-background overflow-hidden transition-shadow focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.10)]">
        <div className="flex items-center">
          <ChatSettingsStatusPopover
            taskStatuses={actions.taskStatuses}
            currentStatusId={form.currentStatusId}
            currentStatus={actions.currentStatus}
            statusPopoverOpen={form.statusPopoverOpen}
            onOpenChange={form.setStatusPopoverOpen}
            onSelect={actions.handleStatusSelect}
          />
          <input
            ref={nameRef}
            id="chat-name"
            value={form.name}
            onChange={(e) => {
              form.setName(e.target.value)
              if (form.channelType === 'email' && !form.subjectTouched) {
                form.setEmailSubject(e.target.value)
              }
            }}
            placeholder={
              !form.isEditMode && form.channelType === 'email'
                ? 'По умолчанию: тема или email'
                : form.isTask
                  ? 'Название задачи'
                  : 'Название чата'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && form.canSave) actions.handleSave()
            }}
            className="flex-1 min-w-0 h-9 pl-1 pr-2 py-1 text-[15px] font-semibold bg-transparent outline-none placeholder:text-muted-foreground/40 placeholder:font-normal"
          />
          <ChatSettingsIconColorPicker
            accentColor={form.accentColor}
            icon={form.icon}
            onAccentColorChange={form.setAccentColor}
            onIconChange={form.setIcon}
          />
        </div>
        <div className="h-px bg-border mx-2" />
        <textarea
          ref={descRef}
          value={form.description}
          onChange={(e) => {
            form.setDescription(e.target.value)
            if (descFocused) growDescription()
          }}
          onFocus={() => {
            setDescFocused(true)
            requestAnimationFrame(growDescription)
          }}
          onBlur={() => {
            setDescFocused(false)
            if (descRef.current) descRef.current.style.height = ''
          }}
          placeholder="Описание — внутренняя заметка команды, клиент не видит…"
          rows={2}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-snug outline-none placeholder:text-muted-foreground/40 max-h-64 overflow-y-auto transition-[height] duration-150"
        />
      </div>
    </div>
  )
}
