/**
 * Toolbar for the chat: search + Telegram/Email link status
 */

import { MessageSearch } from './MessageSearch'
import { TelegramLinkStatus } from './TelegramLinkStatus'

interface ChatToolbarProps {
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
  contactEmail: string | null
  onTelegramClick: () => void
  onEmailClick: () => void
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
  contactEmail,
  onTelegramClick,
  onEmailClick,
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
        <TelegramLinkStatus
          isLinked
          chatTitle={contactEmail}
          onClick={onEmailClick}
          channelType="email"
        />
      )}
    </>
  )
}
