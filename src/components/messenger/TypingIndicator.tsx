interface TypingIndicatorProps {
  typingUsers: { participantId: string; name: string }[]
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null

  const text =
    typingUsers.length === 1
      ? `${typingUsers[0].name} печатает`
      : typingUsers.length === 2
        ? `${typingUsers[0].name} и ${typingUsers[1].name} печатают`
        : `${typingUsers[0].name} и ещё ${typingUsers.length - 1} печатают`

  return (
    <div className="px-4 py-1.5 text-xs text-muted-foreground animate-pulse">
      {text}
      <span className="ml-0.5">...</span>
    </div>
  )
}
