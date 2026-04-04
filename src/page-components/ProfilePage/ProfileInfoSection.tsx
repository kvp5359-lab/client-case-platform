/**
 * ProfileInfoSection — секция с информацией о профиле пользователя
 * Отображает аватар, email, user ID и дату регистрации
 */

import { memo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import type { User } from '@supabase/supabase-js'
import { getEmailInitials } from '@/utils/avatarHelpers'

export interface ProfileInfoSectionProps {
  user: User
}

export const ProfileInfoSection = memo(function ProfileInfoSection({
  user,
}: ProfileInfoSectionProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Информация профиля</CardTitle>
        <CardDescription>Ваши основные данные и статус</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Аватар и основная информация */}
        <div className="flex items-start gap-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} />
            <AvatarFallback className="bg-purple-600 text-white text-lg">
              {getEmailInitials(user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div>
              <Label className="text-xs text-gray-500">Email</Label>
              <p className="text-sm font-medium text-gray-900">{user.email}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">User ID</Label>
              <p className="text-xs font-mono text-gray-600">{user.id}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Присоединился</Label>
              <p className="text-sm text-gray-600">
                {user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
