import { Badge } from '@/components/ui/badge'
import { Loader2, Check, AlertCircle, Clock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface KnowledgeIndexBadgeProps {
  status: string | null
  indexedAt?: string | null
  error?: string | null
}

export function KnowledgeIndexBadge({ status, indexedAt, error }: KnowledgeIndexBadgeProps) {
  if (!status || status === 'none') return null

  const config: Record<
    string,
    {
      label: string
      icon: React.ReactNode
      variant: 'default' | 'secondary' | 'destructive' | 'outline'
    }
  > = {
    pending: {
      label: 'Ожидание',
      icon: <Clock className="h-3 w-3" />,
      variant: 'secondary',
    },
    indexing: {
      label: 'Индексация...',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      variant: 'secondary',
    },
    indexed: {
      label: 'Проиндексировано',
      icon: <Check className="h-3 w-3" />,
      variant: 'outline',
    },
    error: {
      label: 'Ошибка',
      icon: <AlertCircle className="h-3 w-3" />,
      variant: 'destructive',
    },
  }

  const c = config[status] || config.pending

  const badge = (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {c.icon}
      {c.label}
    </Badge>
  )

  if (status === 'indexed' && indexedAt) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p>Проиндексировано: {new Date(indexedAt).toLocaleString('ru-RU')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (status === 'error' && error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p>{error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}
