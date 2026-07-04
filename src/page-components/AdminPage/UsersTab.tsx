"use client"

/**
 * Вкладка «Пользователи»: все аккаунты платформы — воркспейсы/роли,
 * последний вход, бан на уровне платформы, сброс пароля.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAdminUsers, useSetUserBanned } from '@/hooks/useAdmin'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function UsersTab() {
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 300)
  const { data: users, isLoading, error } = useAdminUsers(debounced, true)
  const setBanned = useSetUserBanned()

  const onToggleBan = async (userId: string, email: string, banned: boolean) => {
    if (banned && !window.confirm(`Заблокировать аккаунт ${email}? Все его сессии будут завершены.`)) return
    try {
      await setBanned.mutateAsync({ userId, banned })
      toast.success(banned ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось изменить статус'))
    }
  }

  const onResetPassword = async (email: string) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email)
    if (err) toast.error(getUserFacingErrorMessage(err, 'Не удалось отправить письмо'))
    else toast.success(`Письмо для сброса пароля отправлено на ${email}`)
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Поиск по email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded border px-3 py-1.5 text-sm"
      />

      <div className="rounded-lg border overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Загрузка…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить')}</div>
        ) : !users || users.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Никого не найдено</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Воркспейсы</th>
                <th className="px-3 py-2 font-medium">Регистрация</th>
                <th className="px-3 py-2 font-medium">Последний вход</th>
                <th className="px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className={`border-b ${u.is_banned ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="text-gray-900">{u.email}</div>
                    {u.is_banned && <span className="text-xs text-red-600">заблокирован</span>}
                  </td>
                  <td className="px-3 py-2">
                    {u.workspaces.length === 0 ? (
                      <span className="text-xs text-gray-400">нет</span>
                    ) : (
                      <div className="space-y-0.5">
                        {u.workspaces.map((w) => (
                          <div key={w.workspace_id} className="text-xs text-gray-700">
                            {w.workspace_name}
                            <span className="text-gray-400"> · {(w.roles ?? []).join(', ') || 'без роли'}</span>
                            {!w.can_login && <span className="text-red-500"> · вход закрыт</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{dt(u.created_at)}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{dt(u.last_sign_in_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      className="text-xs text-blue-600 hover:underline mr-3"
                      onClick={() => onResetPassword(u.email)}
                    >
                      сброс пароля
                    </button>
                    <button
                      className={`text-xs hover:underline ${u.is_banned ? 'text-emerald-600' : 'text-red-600'}`}
                      disabled={setBanned.isPending}
                      onClick={() => onToggleBan(u.user_id, u.email, !u.is_banned)}
                    >
                      {u.is_banned ? 'разблокировать' : 'заблокировать'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Бан платформенный — закрывает вход во все воркспейсы. Блокировка внутри одного воркспейса —
        в настройках воркспейса.
      </p>
    </div>
  )
}
