"use client"

/**
 * GoogleDriveSection — секция интеграции с Google Drive
 * Позволяет подключать, переподключать и отключать Google Drive
 */

import { memo } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface GoogleDriveSectionProps {
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Интеграции</CardTitle>
        <CardDescription>Подключайте внешние сервисы для расширения возможностей</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Google Drive */}
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 87.3 78">
                <path
                  d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
                  fill="#0066da"
                />
                <path
                  d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
                  fill="#00ac47"
                />
                <path
                  d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
                  fill="#ea4335"
                />
                <path
                  d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
                  fill="#00832d"
                />
                <path
                  d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
                  fill="#2684fc"
                />
                <path
                  d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
                  fill="#ffba00"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Google Drive</h3>
              <p className="text-sm text-gray-600">
                {connected ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                    Подключено
                  </span>
                ) : (
                  <span className="text-gray-500">Не подключено</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {connected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnect}
                  disabled={loading}
                  className="gap-2"
                >
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
        </div>
      </CardContent>
    </Card>
  )
})
