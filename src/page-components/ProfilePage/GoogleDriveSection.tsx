"use client"

/**
 * GoogleDriveSection — строка интеграции Google Drive в аккордеоне профиля.
 */

import { memo } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GoogleDriveIcon } from '@/components/shared/GoogleDriveIcon'
import { IntegrationRow } from './IntegrationRow'

export type GoogleDriveSectionProps = {
  connected: boolean
  loading: boolean
  onConnect: () => void
  onDisconnect: () => void
}

export const GoogleDriveSection = memo(function GoogleDriveSection({
  connected,
  loading,
  onConnect,
  onDisconnect,
}: GoogleDriveSectionProps) {
  return (
    <IntegrationRow
      icon={<GoogleDriveIcon className="h-[22px] w-[22px]" />}
      title="Google Drive"
      statusLabel={connected ? 'Подключено' : 'Не подключено'}
      tone={connected ? 'ok' : 'off'}
    >
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button variant="outline" size="sm" onClick={onConnect} disabled={loading} className="gap-2">
              <Link2 className="h-4 w-4" />
              Переподключить
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={loading}
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Unlink className="h-4 w-4" />
              Отключить
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onConnect} disabled={loading} className="gap-2">
            <Link2 className="h-4 w-4" />
            {loading ? 'Подключение...' : 'Подключить'}
          </Button>
        )}
      </div>
    </IntegrationRow>
  )
})
