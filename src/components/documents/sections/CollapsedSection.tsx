/**
 * CollapsedSection — общая Collapsible-обёртка для секций документов.
 * Устраняет дублирование из TrashSection, UnassignedSection, DestinationSection, SourceSection.
 */

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'

interface CollapsedSectionProps {
  isCollapsed: boolean
  children: React.ReactNode
}

export function CollapsedSection({ isCollapsed, children }: CollapsedSectionProps) {
  return (
    <Collapsible open={!isCollapsed}>
      <CollapsibleContent className="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden transition-all duration-300">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
