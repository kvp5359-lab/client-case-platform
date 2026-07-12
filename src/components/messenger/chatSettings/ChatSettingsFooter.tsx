import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import type { useChatSettingsFormState } from '../hooks/useChatSettingsFormState'
import type { useChatSettingsActions } from '../hooks/useChatSettingsActions'

type Form = ReturnType<typeof useChatSettingsFormState>
type Actions = ReturnType<typeof useChatSettingsActions>

/**
 * Футер диалога настроек чата: Отмена/Закрыть, «Сохранить черновик» (только
 * email-создание), «Создать/Создать и отправить/Сохранить». Отправка письма с
 * первым сообщением требует получателя И тему. Вынесено из ChatSettingsDialog
 * (аудит 2026-07-13).
 */
export function ChatSettingsFooter({
  form,
  actions,
  isPending,
  emailAttachmentsTooBig,
  emailSendBlockReason,
  onOpenChange,
}: {
  form: Form
  actions: Actions
  isPending?: boolean
  emailAttachmentsTooBig: boolean
  emailSendBlockReason: string | null
  onOpenChange: (v: boolean) => void
}) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        {form.isEditMode ? 'Закрыть' : 'Отмена'}
      </Button>
      {/* Email-создание: «Сохранить черновик» создаёт тред без отправки —
          текст/файлы/тема/получатели переезжают в композер треда. */}
      {!form.isEditMode && form.tabMode === 'email' && (
        <Button
          variant="outline"
          onClick={() => actions.handleSave({ asDraft: true })}
          disabled={isPending || emailAttachmentsTooBig}
        >
          Сохранить черновик
        </Button>
      )}
      {/* Отправка письма (есть первое сообщение) требует и получателя, и тему. */}
      <span title={emailSendBlockReason ?? undefined} className="inline-flex">
        <Button
          onClick={() => actions.handleSave()}
          disabled={!form.canSave || isPending || emailAttachmentsTooBig || !!emailSendBlockReason}
        >
          {form.isEditMode
            ? 'Сохранить'
            : form.hasInitialMessage
              ? 'Создать и отправить'
              : 'Создать'}
        </Button>
      </span>
    </DialogFooter>
  )
}
