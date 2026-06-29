/**
 * Toolbar for the chat: search + Telegram/Email link status
 */

import type { ReactNode } from 'react'
import { Link2, Send, Camera, User, Users, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from './chatVisuals'
import { MessageSearch } from './MessageSearch'
import { TelegramLinkStatus } from './TelegramLinkStatus'

const WhatsAppIcon = getChatIconComponent('whatsapp')

/** Значок канала: платформенный glyph (цветной) + опциональный угловой
 *  суб-значок подтипа (для трёх Telegram-подвидов — группа/личный/бизнес).
 *  Статичный (без действия) — для личных диалогов, где привязки/отвязки нет. */
function ChannelBadgeIcon({
  Icon,
  colorClass,
  title,
  SubIcon,
  onClick,
}: {
  Icon: React.ComponentType<{ className?: string }>
  colorClass: string
  title: string
  SubIcon?: React.ComponentType<{ className?: string }>
  /** Личный диалог — клик открывает карточку контакта. */
  onClick?: () => void
}) {
  const inner = (
    <>
      <Icon className="h-4 w-4" />
      {SubIcon && (
        <span className="absolute -bottom-px -right-px flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-1 ring-white">
          <SubIcon className="h-2.5 w-2.5 text-neutral-700" />
        </span>
      )}
    </>
  )
  const base = 'relative flex items-center justify-center h-7 w-7 rounded-full'
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(base, colorClass, 'hover:bg-muted/60 transition-colors')}
      >
        {inner}
      </button>
    )
  }
  return (
    <span title={title} className={cn(base, colorClass)}>
      {inner}
    </span>
  )
}

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
  /** Личные диалоги — статичный значок канала вместо групповой «розетки». */
  isMtproto?: boolean
  isBusiness?: boolean
  isWazzup?: boolean
  /** Транспорт Wazzup: телефон → WhatsApp, username → Instagram. */
  wazzupKind?: 'whatsapp' | 'instagram'
  /** Клик по значку личного канала → открыть карточку контакта. */
  onChannelIconClick?: () => void
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
  isMtproto,
  isBusiness,
  isWazzup,
  wazzupKind = 'whatsapp',
  onChannelIconClick,
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
      {!isEmailChat &&
        // Приоритет: личные TG (MTProto/Business) → самолётик + суб-значок
        // подтипа; Wazzup → WhatsApp/Instagram; иначе групповой бот (с
        // привязкой/отвязкой) — самолётик + значок «группа».
        (isMtproto ? (
          <ChannelBadgeIcon
            Icon={Send}
            SubIcon={User}
            colorClass="text-[#229ED9]"
            title="Telegram · личный аккаунт"
            onClick={onChannelIconClick}
          />
        ) : isBusiness ? (
          <ChannelBadgeIcon
            Icon={Send}
            SubIcon={Briefcase}
            colorClass="text-[#229ED9]"
            title="Telegram · бизнес-аккаунт"
            onClick={onChannelIconClick}
          />
        ) : isWazzup ? (
          wazzupKind === 'instagram' ? (
            <ChannelBadgeIcon
              Icon={Camera}
              colorClass="text-[#E1306C]"
              title="Instagram"
              onClick={onChannelIconClick}
            />
          ) : (
            <ChannelBadgeIcon
              Icon={WhatsAppIcon}
              colorClass="text-[#25D366]"
              title="WhatsApp"
              onClick={onChannelIconClick}
            />
          )
        ) : (
          // Групповой бот: оставляем интерактивную привязку/отвязку, а сверху —
          // суб-значок «группа» (только когда канал реально привязан).
          <span className="relative inline-flex">
            <TelegramLinkStatus
              isLinked={isLinked}
              chatTitle={telegramChatTitle}
              onClick={onTelegramClick}
            />
            {isLinked && (
              <span className="pointer-events-none absolute -bottom-px -right-px flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-1 ring-white">
                <Users className="h-2.5 w-2.5 text-neutral-700" />
              </span>
            )}
          </span>
        ))}
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
