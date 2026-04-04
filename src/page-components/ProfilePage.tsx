"use client"

/**
 * Profile Page — профиль и настройки пользователя
 *
 * Загрузка данных через React Query (useQuery/useMutation).
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ProfileInfoSection } from './ProfilePage/ProfileInfoSection'
import { GoogleDriveSection } from './ProfilePage/GoogleDriveSection'
import { GmailSection } from './ProfilePage/GmailSection'
import { AppSettingsSection } from './ProfilePage/AppSettingsSection'
import { Database } from '@/types/database'
import { toast } from 'sonner'
import { userSettingsKeys, googleDriveKeys } from '@/hooks/queryKeys'

type UserSettings = Database['public']['Tables']['user_settings']['Row']

export function ProfilePage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const {
    state: confirmState,
    confirm,
    handleConfirm,
    handleCancel: handleConfirmCancel,
  } = useConfirmDialog()

  // Локальное состояние для редактируемых настроек (копия серверных данных)
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null)

  // Google Drive OAuth popup
  const [googleDriveLoading, setGoogleDriveLoading] = useState(false)
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Z5-01: isMounted guard — предотвращает создание интервала после unmount
  const isMountedRef = useRef(true)

  // Cleanup popup check interval on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (popupCheckRef.current) {
        clearInterval(popupCheckRef.current)
        popupCheckRef.current = null
      }
    }
  }, [])

  // --- Загрузка настроек пользователя ---
  const {
    data: settings,
    isLoading: loading,
    error: settingsError,
  } = useQuery({
    queryKey: userSettingsKeys.byUser(user?.id ?? ''),
    queryFn: async () => {
      if (!user) throw new Error('Пользователь не авторизован')

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, это нормально для новых пользователей
        throw error
      }

      return data as UserSettings | null
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  })

  // Синхронизация серверных данных в локальное состояние для редактирования
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings)
    }
  }, [settings])

  // last_workspace_id уже есть в settings — дополнительный запрос не нужен
  const lastWorkspaceId = settings?.last_workspace_id ?? null

  // --- Проверка подключения Google Drive ---
  const { data: googleDriveConnected = false } = useQuery({
    queryKey: googleDriveKeys.connection(user?.id ?? ''),
    queryFn: async () => {
      if (!user) throw new Error('Пользователь не авторизован')

      const { data, error } = await supabase
        .from('google_drive_tokens')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      return !error && !!data
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  })

  // --- Мутация: сохранение настроек ---
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Пользователь не авторизован')

      if (localSettings) {
        // Обновляем существующие настройки
        const { error: updateError } = await supabase
          .from('user_settings')
          .update({
            preferred_ai_model: localSettings.preferred_ai_model,
            theme: localSettings.theme,
            notifications_enabled: localSettings.notifications_enabled,
          })
          .eq('user_id', user.id)

        if (updateError) throw updateError
      } else {
        // Создаём новые настройки
        const { error: insertError } = await supabase.from('user_settings').insert([
          {
            user_id: user.id,
            preferred_ai_model: 'gpt-4',
            theme: 'light',
            notifications_enabled: true,
          },
        ])

        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      toast.success('Настройки сохранены')
      if (user) {
        queryClient.invalidateQueries({ queryKey: userSettingsKeys.byUser(user.id) })
      }
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Не удалось сохранить настройки'
      toast.error(errorMessage)
    },
  })

  // --- Мутация: отключение Google Drive ---
  const disconnectGoogleDriveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Пользователь не авторизован')

      const { error } = await supabase.from('google_drive_tokens').delete().eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Google Drive отключен')
      if (user) {
        queryClient.invalidateQueries({ queryKey: googleDriveKeys.connection(user.id) })
      }
    },
    onError: () => {
      toast.error('Не удалось отключить Google Drive')
    },
  })

  // Слушаем сообщения от OAuth окна
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Z5-06: проверяем origin чтобы не обработать сообщение от чужого окна
      if (event.origin !== window.location.origin) return
      // Z5-02: валидируем event.data по типу — может быть null, string, или объект без .type
      if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string')
        return
      if (event.data.type === 'google-drive-auth-success') {
        toast.success('Google Drive успешно подключен!')
        if (user) {
          queryClient.invalidateQueries({ queryKey: googleDriveKeys.connection(user.id) })
        }
      } else if (event.data.type === 'google-drive-auth-error') {
        toast.error(`Ошибка подключения: ${event.data.error}`)
        setGoogleDriveLoading(false)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient/toast stable refs
  }, [user?.id])

  // Подключение Google Drive
  const handleConnectGoogleDrive = async () => {
    if (!user) {
      toast.error('Необходима авторизация')
      return
    }

    try {
      setGoogleDriveLoading(true)

      // Вызываем Edge Function для получения OAuth URL
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: { userId: user.id, origin: window.location.origin },
      })

      if (error) {
        toast.error('Не удалось получить ссылку для авторизации')
        setGoogleDriveLoading(false)
        return
      }

      if (!data?.authUrl) {
        toast.error('Не получен URL для авторизации')
        setGoogleDriveLoading(false)
        return
      }

      // Открываем OAuth окно
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        data.authUrl,
        'GoogleDriveAuth',
        `width=${width},height=${height},left=${left},top=${top}`,
      )

      if (!popup) {
        toast.error('Не удалось открыть окно авторизации. Разрешите всплывающие окна.')
        setGoogleDriveLoading(false)
        return
      }

      // Z5-01: Проверяем, закрыто ли окно (если пользователь закрыл вручную).
      // isMountedRef guard предотвращает создание интервала после unmount.
      if (popupCheckRef.current) {
        clearInterval(popupCheckRef.current)
      }
      if (!isMountedRef.current) return
      popupCheckRef.current = setInterval(() => {
        if (popup.closed) {
          if (popupCheckRef.current) {
            clearInterval(popupCheckRef.current)
            popupCheckRef.current = null
          }
          if (isMountedRef.current) {
            setGoogleDriveLoading(false)
          }
        }
      }, 500)
    } catch {
      toast.error('Ошибка при подключении Google Drive')
      setGoogleDriveLoading(false)
    }
  }

  // Отключение Google Drive
  const handleDisconnectGoogleDrive = async () => {
    if (!user) return

    const ok = await confirm({
      title: 'Отключить Google Drive?',
      description: 'Это отключит доступ к файлам из Google Drive.',
      variant: 'destructive',
      confirmText: 'Отключить',
    })
    if (!ok) return

    disconnectGoogleDriveMutation.mutate()
  }

  // Сброс локальных изменений к серверным данным
  const handleCancelSettings = () => {
    if (settings) {
      setLocalSettings(settings)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container max-w-2xl mx-auto p-6">
          <Alert variant="destructive">
            <AlertDescription>Необходимо войти в систему</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  const errorMessage = settingsError ? 'Не удалось загрузить настройки' : null

  return (
    <div className="min-h-screen bg-white">
      <ConfirmDialog
        state={confirmState}
        onConfirm={handleConfirm}
        onCancel={handleConfirmCancel}
      />

      <div className="container max-w-2xl mx-auto p-6">
          {/* Заголовок */}
          <div className="mb-6">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 gap-2">
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Button>
            <h1 className="text-3xl font-bold mb-2">Профиль</h1>
            <p className="text-gray-600">Управление вашим профилем и настройками</p>
          </div>

          {errorMessage && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Информация о профиле */}
          <ProfileInfoSection user={user} />

          {/* Интеграции */}
          <GoogleDriveSection
            connected={googleDriveConnected}
            loading={googleDriveLoading || disconnectGoogleDriveMutation.isPending}
            onConnect={handleConnectGoogleDrive}
            onDisconnect={handleDisconnectGoogleDrive}
          />

          {/* Gmail */}
          <GmailSection workspaceId={lastWorkspaceId} />

          {/* Настройки приложения */}
          <AppSettingsSection
            settings={localSettings}
            loading={loading}
            saving={saveSettingsMutation.isPending}
            onSettingsChange={setLocalSettings}
            onSave={() => saveSettingsMutation.mutate()}
            onCancel={handleCancelSettings}
          />
        </div>
    </div>
  )
}
