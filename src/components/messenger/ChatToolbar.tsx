/**
 * Toolbar for the chat: search + Telegram/Email link status
 */

import type { ReactNode } from 'react'
import { Link2 } from 'lucide-react'
import { MessageSearch } from './MessageSearch'
import { TelegramLinkStatus } from './TelegramLinkStatus'

type ChatToolbarProps = {
  // Search
  searchQuery: string
  onSearchChange: (q: string) => void
  searchOpen: boolean
  onSearchToggle: () => void
  resultCount: number
  isSearching: boolean
  // Email/Telegram
  isEmailChat: boolean
  isLinked: boolean
  telegramChatTitle: string | null
  onTelegramClick: () => void
  /** Для email-треда — слот с темой/получателем (EmailSubjectBar) рядом с индикатором подключения. */
  emailBar?: ReactNode
  /** Маленький индикатор подключения email-канала — открывает диалог привязки. */
  onEmailLinkClick?: () => void
}

export function ChatToolbar({
  searchQuery,
  onSearchChange,
  searchOpen,
  onSearchToggle,
  resultCount,
  isSearching,
  isEmailChat,
  isLinked,
  telegramChatTitle,
  onTelegramClick,
  emailBar,
  onEmailLinkClick,
}: ChatToolbarProps) {
  return (
    <>
      <MessageSearch
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        isOpen={searchOpen}
        onToggle={onSearchToggle}
        resultCount={resultCount}
        isSearching={isSearching}
      />
      {!isEmailChat && (
        <TelegramLinkStatus
          isLinked={isLinked}
          chatTitle={telegramChatTitle}
          onClick={onTelegramClick}
        />
      )}
      {isEmailChat && (
        <div className="relative inline-flex">
          {emailBar}
          {onEmailLinkClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEmailLinkClick()
              }}
              className="absolute bottom-0 right-0 z-10 flex h-3 w-3 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-white shadow-sm hover:text-emerald-700"
              title="Email подключён"
            >
              <Link2 className="h-2 w-2" />
            </button>
          )}
        </div>
      )}
    </>
  )
}
