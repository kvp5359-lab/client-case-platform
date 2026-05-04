"use client"

import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useClientWorkspaceProjects } from '@/hooks/useClientWorkspaceProjects'
import { supabase } from '@/lib/supabase'

interface ClientProjectHeaderProps {
  workspaceId: string
  projectId: string
  projectName: string
}

export function ClientProjectHeader({
  workspaceId,
  projectId,
  projectName,
}: ClientProjectHeaderProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { data: projects = [] } = useClientWorkspaceProjects(workspaceId)

  const hasMultiple = projects.length > 1
  const initial = user?.email?.charAt(0).toUpperCase() || '?'
  const username = user?.email?.split('@')[0] || 'User'

  const handleSelectProject = (id: string) => {
    if (id !== projectId) {
      router.push(`/workspaces/${workspaceId}/projects/${id}`)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      {hasMultiple ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 text-lg font-bold hover:text-primary transition-colors">
              <span className="truncate max-w-[60vw]">{projectName}</span>
              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px] max-w-[420px]">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => handleSelectProject(p.id)}
                className={p.id === projectId ? 'font-semibold bg-gray-100' : 'cursor-pointer'}
              >
                <span className="truncate">{p.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <h1 className="text-lg font-bold truncate">{projectName}</h1>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Меню профиля"
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-700 hidden sm:block max-w-[160px] truncate">
              {username}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{username}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/profile')} className="cursor-pointer">
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
    </div>
  )
}
