/**
 * SettingsCard — сворачиваемая карточка настройки.
 *
 * Свёрнутый вид — одна компактная строка: иконка + заголовок + шеврон.
 * Описание показывается только в раскрытом теле (чтобы список настроек
 * не разрастался). По умолчанию свёрнута.
 */

import { type ReactNode, createContext, useContext, useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/**
 * Когда true — SettingsCard рендерится РАЗВЁРНУТО и БЕЗ сворачивания (статичный
 * заголовок + контент). Используется в двухпанельных разделах (Общие/Права), где
 * слева меню секций, а справа выбранная секция всегда раскрыта.
 */
export const SettingsCardForceOpenContext = createContext(false)

type SettingsCardProps = {
  title: ReactNode
  description?: ReactNode
  /** Иконка слева от заголовка */
  icon?: LucideIcon
  defaultOpen?: boolean
  /** Дополнительный контент в шапке справа (бейдж, статус) */
  headerExtra?: ReactNode
  /** Обернуть детей в CardContent (по умолчанию true). Выключить, если ребёнок сам рендерит CardContent. */
  padded?: boolean
  children: ReactNode
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  headerExtra,
  padded = true,
  children,
}: SettingsCardProps) {
  const forceOpen = useContext(SettingsCardForceOpenContext)
  const [open, setOpen] = useState(defaultOpen)

  // Двухпанельный режим: карточка всегда раскрыта, без шеврона/сворачивания.
  if (forceOpen) {
    return (
      <Card className="overflow-hidden border-0 shadow-none">
        <div className="flex items-center gap-3 px-6 pt-4 pb-1">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <CardTitle className="min-w-0 flex-1 text-sm font-medium">{title}</CardTitle>
          {headerExtra}
        </div>
        {description && (
          <CardDescription className="px-6 pb-3 pt-0">{description}</CardDescription>
        )}
        {padded ? <CardContent className="pt-0">{children}</CardContent> : children}
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/40"
          >
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <CardTitle className="min-w-0 flex-1 truncate text-sm font-medium">{title}</CardTitle>
            {headerExtra}
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {description && (
            <CardDescription className="px-6 pb-3 pt-0">{description}</CardDescription>
          )}
          {padded ? <CardContent className="pt-0">{children}</CardContent> : children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
