"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WorkspaceParticipant } from '@/hooks/shared/useWorkspaceParticipants'
import { TelegramBusinessSection } from './TelegramBusinessSection'
import { TelegramMTProtoSection } from './TelegramMTProtoSection'

/**
 * Личный Telegram сотрудника — общая вкладка для двух способов подключения:
 *  - MTProto (любой Telegram-аккаунт, без Premium) — phone + код, опц. 2FA
 *  - Business (требует Telegram Premium) — бот-делегат через настройки TG
 */
export function PersonalTelegramSection({
  workspaceId,
  employees,
}: {
  workspaceId: string
  employees: WorkspaceParticipant[]
}) {
  return (
    <Tabs defaultValue="mtproto" className="space-y-4">
      <TabsList>
        <TabsTrigger value="mtproto">MTProto (любой аккаунт)</TabsTrigger>
        <TabsTrigger value="business">Telegram Business (Premium)</TabsTrigger>
      </TabsList>
      <TabsContent value="mtproto" className="mt-2">
        <TelegramMTProtoSection workspaceId={workspaceId} employees={employees} />
      </TabsContent>
      <TabsContent value="business" className="mt-2">
        <TelegramBusinessSection workspaceId={workspaceId} employees={employees} />
      </TabsContent>
    </Tabs>
  )
}
