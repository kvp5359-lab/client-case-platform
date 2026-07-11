/**
 * Минимальная форма участника для отрисовки аватарок внахлёст.
 * Определение вынесено сюда (нижний слой), чтобы хуки/утилиты не импортировали
 * вверх из `components/participants/ParticipantAvatars` (который реэкспортирует тип).
 */

export type AvatarParticipant = {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
}
