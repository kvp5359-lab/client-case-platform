/**
 * Channel section (Telegram + Email) for ChatSettingsDialog.
 * Handles both create and edit modes.
 */

import { useRef, memo } from 'react'
import { Mail, Unlink, Loader2, Send, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TabMode, ChannelType } from './chatSettingsTypes'

interface EmailChip {
  email: string
  label: string
}

interface EmailSuggestion {
  email: string
  label: string
  freq?: number
}

interface TelegramLinkInfo {
  telegram_chat_title?: string | null
}

interface EmailLinkInfo {
  id: string
  contact_email: string
}

interface ChatSettingsChannelsProps {
  tabMode: TabMode
  channelType: ChannelType
  isEditMode: boolean
  // Telegram (edit mode)
  isTelegramLinked: boolean
  telegramLink: TelegramLinkInfo | null | undefined
  telegramLinkCode: string | null | undefined
  isTelegramCodeLoading: boolean
  isTelegramUnlinking: boolean
  telegramCopied: boolean
  onUnlinkTelegram: () => void
  onCopyTelegramCode: () => void
  // Telegram (create mode)
  channelExpanded: boolean
  telegramChannelType: 'none' | 'telegram'
  onSetChannelExpanded: (v: boolean) => void
  onSetTelegramChannelType: (v: 'none' | 'telegram') => void
  // Email link (edit mode)
  emailLink: EmailLinkInfo | null | undefined
  onLinkEmail: () => void
  onUnlinkEmail: () => void
  isLinkingEmail: boolean
  isUnlinkingEmail: boolean
  // Email fields
  selectedEmails: EmailChip[]
  emailInput: string
  emailSubject: string
  subjectTouched: boolean
  emailSuggestions: EmailSuggestion[]
  filteredSuggestions: EmailSuggestion[]
  emailDropdownOpen: boolean
  onSetSelectedEmails: React.Dispatch<React.SetStateAction<EmailChip[]>>
  onSetEmailInput: (v: string) => void
  onSetEmailSubject: (v: string) => void
  onSetSubjectTouched: (v: boolean) => void
  onSetEmailDropdownOpen: (v: boolean) => void
}

export const ChatSettingsChannels = memo(function ChatSettingsChannels({
  tabMode,
  channelType,
  isEditMode,
  // Telegram
  isTelegramLinked,
  telegramLink,
  telegramLinkCode,
  isTelegramCodeLoading,
  isTelegramUnlinking,
  telegramCopied,
  onUnlinkTelegram,
  onCopyTelegramCode,
  channelExpanded,
  telegramChannelType,
  onSetChannelExpanded,
  onSetTelegramChannelType,
  // Email link
  emailLink,
  onLinkEmail,
  onUnlinkEmail,
  isLinkingEmail,
  isUnlinkingEmail,
  // Email fields
  selectedEmails,
  emailInput,
  emailSubject,
  subjectTouched: _subjectTouched,
  emailSuggestions,
  filteredSuggestions,
  emailDropdownOpen,
  onSetSelectedEmails,
  onSetEmailInput,
  onSetEmailSubject,
  onSetSubjectTouched,
  onSetEmailDropdownOpen,
}: ChatSettingsChannelsProps) {
  const emailInputRef = useRef<HTMLInputElement>(null)
  const emailDropdownRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex flex-col gap-2">
      {/* Активные привязки (edit mode) */}
      {isEditMode && isTelegramLinked && telegramLink && (
        <div className="flex items-center justify-between rounded-lg border px-3 py-1.5 bg-sky-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <Send className="h-3.5 w-3.5 text-[#2AABEE] shrink-0" />
            <span className="text-sm font-medium truncate">
              {telegramLink.telegram_chat_title || 'Telegram'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onUnlinkTelegram()}
            disabled={isTelegramUnlinking}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 shrink-0 ml-2"
          >
            {isTelegramUnlinking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unlink className="h-3 w-3" />
            )}
            Отвязать
          </button>
        </div>
      )}
      {isEditMode && emailLink && (
        <div className="flex items-center justify-between rounded-lg border px-3 py-1.5 bg-red-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="text-sm font-medium truncate">{emailLink.contact_email}</span>
          </div>
          <button
            type="button"
            onClick={onUnlinkEmail}
            disabled={isUnlinkingEmail}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 shrink-0 ml-2"
          >
            {isUnlinkingEmail ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unlink className="h-3 w-3" />
            )}
            Отвязать
          </button>
        </div>
      )}

      {/* Кнопка подключения Telegram (только для режима Чат) */}
      {tabMode === 'chat' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (channelExpanded) {
                onSetChannelExpanded(false)
                onSetTelegramChannelType('none')
              } else {
                onSetChannelExpanded(true)
              }
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <Unlink className="w-3 h-3" />
            Подключить канал
          </button>
          {channelExpanded && (
            <button
              type="button"
              onClick={() =>
                onSetTelegramChannelType(telegramChannelType === 'telegram' ? 'none' : 'telegram')
              }
              className={
                telegramChannelType === 'telegram'
                  ? 'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs transition-colors border bg-brand-100 border-brand-200 text-brand-600 font-medium'
                  : 'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs transition-colors border text-muted-foreground border-transparent hover:bg-muted/50'
              }
            >
              <Send className="w-3 h-3" />
              Telegram
            </button>
          )}
        </div>
      )}

      {/* Telegram — код привязки (edit mode) или подсказка (create mode) */}
      {channelType === 'telegram' &&
        (isEditMode ? (
          <div className="pl-0.5">
            <p className="text-xs text-muted-foreground mb-1.5">
              Добавьте бота в Telegram-группу и отправьте:
            </p>
            {isTelegramCodeLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Генерация кода...
              </div>
            ) : telegramLinkCode ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-muted rounded text-sm font-mono select-all">
                  /link {telegramLinkCode}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 px-2"
                  onClick={onCopyTelegramCode}
                >
                  {telegramCopied ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground pl-0.5">
            После создания появится код для привязки группы Telegram
          </p>
        ))}

      {/* Email — поля ввода (create mode) или привязка (edit mode) */}
      {channelType === 'email' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-muted-foreground">Письмо</label>
          <div className="relative">
            {/* Chips + input wrapper */}
            <div
              className="flex flex-wrap items-center gap-1 min-h-[32px] px-2 py-1 rounded-md border bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 cursor-text"
              onClick={() => emailInputRef.current?.focus()}
            >
              {selectedEmails.map((chip) => (
                <span
                  key={chip.email}
                  className="inline-flex items-center gap-1 max-w-[220px] rounded-md px-2 py-0.5 text-xs border"
                  style={{
                    backgroundColor: 'hsl(var(--brand-100))',
                    borderColor: 'hsl(var(--brand-200))',
                  }}
                  title={chip.email}
                >
                  <span className="truncate">
                    {chip.label !== chip.email ? chip.label : chip.email}
                  </span>
                  <button
                    type="button"
                    className="flex-shrink-0 rounded-sm hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetSelectedEmails((prev) => prev.filter((e) => e.email !== chip.email))
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={emailInputRef}
                type="email"
                value={emailInput}
                onChange={(e) => {
                  onSetEmailInput(e.target.value)
                  onSetEmailDropdownOpen(true)
                }}
                onFocus={() => onSetEmailDropdownOpen(true)}
                onBlur={() => {
                  setTimeout(() => onSetEmailDropdownOpen(false), 150)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !emailInput && selectedEmails.length > 0) {
                    onSetSelectedEmails((prev) => prev.slice(0, -1))
                  }
                  if ((e.key === 'Enter' || e.key === ',') && emailInput.trim()) {
                    e.preventDefault()
                    const val = emailInput.trim().replace(/,$/, '')
                    if (
                      val.includes('@') &&
                      !selectedEmails.some((s) => s.email.toLowerCase() === val.toLowerCase())
                    ) {
                      const match = emailSuggestions.find(
                        (s) => s.email.toLowerCase() === val.toLowerCase(),
                      )
                      onSetSelectedEmails((prev) => [
                        ...prev,
                        { email: val, label: match?.label ?? val },
                      ])
                      onSetEmailInput('')
                    }
                  }
                }}
                placeholder={selectedEmails.length === 0 ? 'Email клиента' : ''}
                className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground/40 text-sm"
                autoComplete="off"
              />
            </div>
            {emailDropdownOpen && filteredSuggestions.length > 0 && (
              <div
                ref={emailDropdownRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover shadow-md"
              >
                {filteredSuggestions.map((s) => (
                  <button
                    key={s.email}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent cursor-pointer flex flex-col"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSetSelectedEmails((prev) => [...prev, { email: s.email, label: s.label }])
                      onSetEmailInput('')
                      emailInputRef.current?.focus()
                    }}
                  >
                    {s.label !== s.email ? (
                      <>
                        <span className="truncate">{s.label}</span>
                        <span className="text-xs text-muted-foreground truncate">{s.email}</span>
                      </>
                    ) : (
                      <span className="truncate">{s.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input
            value={emailSubject}
            onChange={(e) => {
              onSetEmailSubject(e.target.value)
              onSetSubjectTouched(true)
            }}
            placeholder="Тема письма"
            className="h-8 text-sm"
          />
          {isEditMode && (
            <Button
              size="sm"
              variant="outline"
              onClick={onLinkEmail}
              disabled={!emailInput.trim() || isLinkingEmail}
              className="self-start"
            >
              {isLinkingEmail && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Привязать
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
