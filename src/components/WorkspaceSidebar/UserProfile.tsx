"use client"

/**
 * UserProfile — профиль пользователя в нижней части WorkspaceSidebar
 * Отображает аватар, email и dropdown-меню с настройками
 */

import { memo } from 'react'
import { User as UserIcon, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { User } from '@supabase/supabase-js'

export interface UserProfileProps {
  user: User
  onProfileClick: () => void
  onSignOut: () => Promise<void>
}

export const UserProfile = memo(function UserProfile({
  user,
  onProfileClick,
  onSignOut,
}: UserProfileProps) {
  const initial = user.email?.charAt(0).toUpperCase() || '?'
  const username = user.email?.split('@')[0] || 'User'

  const handleSignOut = async () => {
    await onSignOut()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Меню профиля"
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200"
        >
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-gray-900 truncate">{username}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-64">
        {/* Заголовок с информацией о пользователе */}
        <div className="flex items-center gap-3 px-2 py-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{username}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onProfileClick} className="cursor-pointer">
          <UserIcon className="mr-2 h-4 w-4" />
          Профиль
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выход
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
