"use client"

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import type { BotIntegration, DialogState } from './types'

type BotTokenDialogProps = {
  state: DialogState | null
  onClose: () => void
  onSaved: () => void
}

type TelegramGetMe = {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

export function BotTokenDialog({ state, onClose, onSaved }: BotTokenDialogProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!state) throw new Error('Не выбран бот')
      const trimmed = token.trim()
      if (!trimmed) throw new Error('Введите токен')

      let me: TelegramGetMe
      try {
        const res = await fetch(`https://api.telegram.org/bot${trimmed}/getMe`)
        const json = (await res.json()) as {
          ok: boolean
          result?: TelegramGetMe
          description?: string
        }
        if (!json.ok || !json.result) {
          throw new Error(json.description || 'Telegram отверг токен')
        }
        me = json.result
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? `Не удалось проверить токен: ${err.message}`
            : 'Не удалось проверить токен',
        )
      }

      const baseConfig = state.bot?.config ?? state.createParams?.config ?? {}
      const newConfig = {
        ...baseConfig,
        bot_id: me.id,
        bot_username: me.username,
        bot_display_name: me.first_name,
      }

      let integrationId: string | null = null
      let integrationType: BotIntegration['type'] | null = null

      if (state.bot) {
        const { error: updErr } = await supabase
          .from('workspace_integrations')
          .update({ secrets: { token: trimmed }, config: newConfig })
          .eq('id', state.bot.id)
        if (updErr) throw updErr
        integrationId = state.bot.id
        integrationType = state.bot.type
      } else if (state.createParams) {
        const { data: ins, error: insErr } = await supabase
          .from('workspace_integrations')
          .insert({
            workspace_id: state.createParams.workspace_id,
            type: state.createParams.type,
            config: newConfig,
            secrets: { token: trimmed },
            is_active: true,
          })
          .select('id')
          .single()
        if (insErr) throw insErr
        integrationId = ins?.id ?? null
        integrationType = state.createParams.type
      } else {
        throw new Error('Невозможный сценарий: ни bot, ни createParams не заданы')
      }

      // Для личного бота — серверная регистрация webhook'а через
      // edge-функцию. Edge-функция читает токен из БД и зовёт Telegram API.
      // Это надёжнее, чем вызов напрямую из браузера: даже если у юзера
      // отвалится интернет в момент сохранения, edge-функция отработает.
      if (integrationType === 'telegram_employee_bot' && integrationId) {
        const { data: regData, error: regErr } = await supabase.functions.invoke(
          'telegram-register-webhook',
          { body: { integration_id: integrationId, action: 'register' } },
        )
        if (regErr || (regData as { ok?: boolean })?.ok === false) {
          console.warn('[register-webhook] failed:', regErr ?? regData)
          toast.warning(
            'Токен сохранён, но webhook не зарегистрировался. Реплаи в Telegram могут не связываться с исходниками. Попробуй ещё раз — нажми «Изменить» и сохрани тот же токен.',
          )
        }
      }
    },
    onSuccess: () => {
      toast.success('Токен сохранён')
      setToken('')
      setError(null)
      onSaved()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить токен')
    },
  })

  // Удаление: бот-секретарь оставляет запись с пустыми secrets (env-fallback),
  // личный бот сотрудника удаляется целиком.
  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!state?.bot) throw new Error('Бот не выбран')
      if (state.bot.type === 'telegram_workspace_bot') {
        const { error: updErr } = await supabase
          .from('workspace_integrations')
          .update({
            secrets: {},
            config: {
              ...state.bot.config,
              bot_id: undefined,
              bot_username: undefined,
              bot_display_name: undefined,
            },
          })
          .eq('id', state.bot.id)
        if (updErr) throw updErr
      } else {
        // Сначала отзываем webhook у Telegram (пока токен ещё в БД и
        // edge-функция может его прочитать). Если запрос упал —
        // продолжаем удаление, webhook останется висеть, но он будет
        // отбиваться 401 на нашей стороне (его secret_token больше не
        // совпадёт ни с одной активной интеграцией).
        try {
          await supabase.functions.invoke('telegram-register-webhook', {
            body: { integration_id: state.bot.id, action: 'remove' },
          })
        } catch (err) {
          console.warn('[delete-webhook] failed, continuing with row delete:', err)
        }
        const { error: delErr } = await supabase
          .from('workspace_integrations')
          .delete()
          .eq('id', state.bot.id)
        if (delErr) throw delErr
      }
    },
    onSuccess: () => {
      toast.success('Токен удалён')
      setToken('')
      setError(null)
      onSaved()
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Не удалось удалить токен')
    },
  })

  const open = state !== null
  const hasExisting = !!state?.bot

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setToken('')
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title ?? 'Токен Telegram-бота'}</DialogTitle>
          <DialogDescription>
            Вставьте токен, полученный у @BotFather. Перед сохранением мы проверим его через
            Telegram и покажем, какому боту он принадлежит.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Input
            type="password"
            placeholder="123456:ABC-DEF1234..."
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setError(null)
            }}
            autoFocus
            disabled={saveMutation.isPending}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {hasExisting && state?.bot?.has_token && (
            <p className="text-xs text-muted-foreground">
              Токен уже сохранён в БД. Введите новый, чтобы заменить, или удалите по кнопке ниже.
            </p>
          )}
        </div>
        <DialogFooter className="flex flex-row justify-between items-center sm:justify-between">
          <div>
            {hasExisting && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending || saveMutation.isPending}
              >
                Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>
              Отмена
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !token.trim()}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Проверка…
                </>
              ) : (
                'Сохранить'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
