/**
 * ParticipantAvatar — единый компонент отображения аватара или инициала участника.
 * Используется в AssigneeFilter, ParticipantsPicker и других местах.
 */

import { cn } from '@/lib/utils'

interface ParticipantAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md'
}

export function ParticipantAvatar({ name, avatarUrl, size = 'sm' }: ParticipantAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn(sizeClass, 'rounded-full object-cover shrink-0')}
      />
    )
  }
  return (
    <div
      className={cn(
        sizeClass,
        'rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground shrink-0',
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
