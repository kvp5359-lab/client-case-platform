import { hashString } from './notionPill'

/** Инициалы из имени (первые буквы первых двух слов) */
export function getInitials(name: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** Инициалы из email (первые 2 символа части до @) */
export function getEmailInitials(email: string | undefined): string {
  if (!email) return '??'
  const parts = email.split('@')[0]
  return parts.slice(0, 2).toUpperCase()
}

/** Стабильный цвет по имени */
const avatarColors = [
  'bg-red-100 text-red-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
]

export function getAvatarColor(name: string): string {
  return avatarColors[hashString(name) % avatarColors.length]
}
