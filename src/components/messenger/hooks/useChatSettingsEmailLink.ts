import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  useEmailLink,
  useCreateEmailLink,
  useRemoveEmailLink,
  useUpdateEmailLink,
} from '@/hooks/email/useEmailLink'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import type { useChatSettingsFormState } from './useChatSettingsFormState'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

/**
 * Email-канал в настройках чата: текущая привязка, синхронизация полей формы с
 * ней (edit-режим), привязка/отвязка/обновление. Вынесено из
 * useChatSettingsActions (аудит 2026-07-13) — логика не менялась.
 */
export function useChatSettingsEmailLink(args: {
  chat: ProjectThread | null
  form: FormReturn
  open: boolean
}) {
  const { chat, form, open } = args

  const { data: emailLink } = useEmailLink(chat?.id)
  const createEmailLink = useCreateEmailLink(chat?.id)
  const updateEmailLink = useUpdateEmailLink(chat?.id)
  const removeEmailLink = useRemoveEmailLink(chat?.id)

  // Синхронизация полей «Email клиента» / «Тема письма» с текущей привязкой,
  // чтобы пользователь видел закреплённое за тредом и мог отредактировать.
  useEffect(() => {
    if (!open || !form.isEditMode) return
    if (emailLink) {
      // Только если ещё не вводил вручную (не перезаписываем правки пользователя).
      if (form.selectedEmails.length === 0 && !form.emailInput) {
        form.setSelectedEmails([{ email: emailLink.contact_email, label: emailLink.contact_email }])
      }
      if (!form.emailSubject && !form.subjectTouched) {
        form.setEmailSubject(emailLink.subject ?? '')
      }
    } else {
      // Привязки нет → очищаем поля, чтобы можно было ввести новую.
      if (form.selectedEmails.length > 0) form.setSelectedEmails([])
      if (form.emailSubject && !form.subjectTouched) form.setEmailSubject('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailLink?.id, open, chat?.id])

  const handleLinkEmail = useCallback(() => {
    // Целевой адрес: input, либо уже выбранный чип (обновление при пустом input).
    const targetEmail =
      form.emailInput.trim() ||
      (form.selectedEmails.length > 0 ? form.selectedEmails[0].email : '')
    if (!targetEmail) return
    const subject = form.emailSubject.trim() || undefined

    if (emailLink) {
      updateEmailLink.mutate(
        { linkId: emailLink.id, contactEmail: targetEmail, subject: subject ?? null },
        {
          onSuccess: () => {
            toast.success('Email-канал обновлён')
            form.setEmailInput('')
            form.setSubjectTouched(false)
          },
          onError: () => toast.error('Не удалось обновить email-канал'),
        },
      )
    } else {
      createEmailLink.mutate(
        { contactEmail: targetEmail, subject },
        {
          onSuccess: () => {
            toast.success('Email привязан')
            form.setEmailInput('')
            form.setSubjectTouched(false)
          },
          onError: () => toast.error('Не удалось привязать email'),
        },
      )
    }
  }, [form, createEmailLink, updateEmailLink, emailLink])

  const handleUnlinkEmail = useCallback(() => {
    if (!emailLink) return
    removeEmailLink.mutate(emailLink.id, {
      onSuccess: () => toast.success('Email отвязан'),
      onError: () => toast.error('Не удалось отвязать email'),
    })
  }, [emailLink, removeEmailLink])

  return {
    emailLink,
    handleLinkEmail,
    handleUnlinkEmail,
    isLinkingEmail: createEmailLink.isPending || updateEmailLink.isPending,
    isUnlinkingEmail: removeEmailLink.isPending,
  }
}
