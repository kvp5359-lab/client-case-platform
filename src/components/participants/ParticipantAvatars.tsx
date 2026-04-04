/**
 * Аватарки участников внахлёст (стиль Asana) с тултипом-списком имён.
 * Переиспользуется в InboxPage и может быть использован в других местах.
 */

export interface AvatarParticipant {
  id: string
  name: string
  last_name: string | null
  avatar_url: string | null
}

export function ParticipantAvatars({
  participants,
  maxVisible = 5,
}: {
  participants: AvatarParticipant[]
  maxVisible?: number
}) {
  const visible = participants.slice(0, maxVisible)
  const overflow = participants.length - maxVisible

  const names = participants
    .map((p) => `${p.name}${p.last_name ? ` ${p.last_name}` : ''}`)
    .join(', ')

  return (
    <div
      className="group/avatars relative flex items-center -space-x-1.5 shrink-0"
      aria-label={`Участники: ${names}`}
    >
      {visible.map((p) => (
        <div key={p.id} className="relative">
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt={p.name}
              className="w-6 h-6 rounded-full object-cover ring-[1.5px] ring-white"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 ring-[1.5px] ring-white flex items-center justify-center text-[9px] font-medium text-gray-600">
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-100 ring-[1.5px] ring-white flex items-center justify-center text-[9px] font-medium text-gray-500">
          +{overflow}
        </div>
      )}
      {/* Тултип со списком имён */}
      <div className="absolute top-full left-0 mt-1.5 hidden group-hover/avatars:block z-50">
        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-nowrap">
          {participants.map((p) => (
            <div key={p.id} className="py-0.5">
              {p.name}
              {p.last_name ? ` ${p.last_name}` : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
