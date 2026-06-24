"use client"

/**
 * EditorDialogContent — обёртка над DialogContent для диалогов с Tiptap-редактором.
 *
 * Зачем: tiptap-поповеры (цвет, выравнивание, ссылка, таблица…) рендерятся в
 * портал ВНЕ DialogContent. Radix Dialog по умолчанию закрывается по клику вне
 * контента → клик по такому поповеру (или случайный клик по затемнению) закрывал
 * диалог и терял несохранённый текст. Эта обёртка блокирует закрытие по клику
 * вне — закрытие остаётся осознанным (крестик / Esc / кнопки).
 *
 * Любой новый диалог с редактором должен использовать ЕЁ, а не голый
 * DialogContent, чтобы не повторять этот баг.
 */

import * as React from 'react'
import { DialogContent } from '@/components/ui/dialog'

type Props = React.ComponentPropsWithoutRef<typeof DialogContent>

export const EditorDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  Props
>(({ onInteractOutside, ...props }, ref) => (
  <DialogContent
    ref={ref}
    onInteractOutside={(e) => {
      e.preventDefault()
      onInteractOutside?.(e)
    }}
    {...props}
  />
))
EditorDialogContent.displayName = 'EditorDialogContent'
