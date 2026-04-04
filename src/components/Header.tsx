"use client"

/**
 * Header — верхняя панель приложения
 *
 * Содержит:
 * - Лого/название приложения слева
 */

import { useNavigate, useParams } from 'next/navigation'

interface HeaderProps {
  /** ID текущего workspace (опционально, берётся из URL если не указан) */
  workspaceId?: string
}

export function Header({ workspaceId }: HeaderProps) {
  const router = useRouter()
  const params = useParams<{ workspaceId?: string }>()

  // Используем workspaceId из пропса или из URL
  const currentWorkspaceId = workspaceId || params.workspaceId

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex h-14 items-center px-4">
        {/* Левая часть — лого */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="На главную"
            onClick={() => {
              // Если находимся внутри пространства, остаёмся в нём
              // Если на странице workspaces, остаёмся там
              if (currentWorkspaceId) {
                router.push(`/workspaces/${currentWorkspaceId}`)
              } else {
                router.push('/workspaces')
              }
            }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-gray-900 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
          </button>
        </div>
      </div>
    </header>
  )
}
