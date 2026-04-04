import { MessageSquare } from 'lucide-react'

export function ChatEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-md px-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-blue-500" />
        </div>
        <h3 className="font-medium text-lg">Нет сообщений</h3>
        <p className="text-sm text-muted-foreground">
          Начните переписку — отправьте первое сообщение
        </p>
      </div>
    </div>
  )
}
