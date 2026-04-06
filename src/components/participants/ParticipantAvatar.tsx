/**
 * ParticipantAvatar — единый компонент отображения аватара или инициала участника.
 * Используется в AssigneeFilter, ParticipantsPicker и других местах.
 */

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface ParticipantAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: 'sm' | 'md'
}

export function ParticipantAvatar({ name, avatarUrl, size = 'sm' }: ParticipantAvatarProps) {
  const sizeClass = size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-7 h-7 text-xs'
  if (avatarUrl) {
    const px = size === 'sm' ? 20 : 28
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={px}
        height={px}
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
