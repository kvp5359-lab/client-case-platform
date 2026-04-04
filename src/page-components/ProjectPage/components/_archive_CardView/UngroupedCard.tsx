"use client"

/**
 * Карточка нераспределённых документов (без папки)
 */

import { memo } from 'react'
import { Inbox } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DocumentItem } from './DocumentItem'
import type { DocumentWithFiles } from '@/components/documents/types'

export interface UngroupedCardProps {
  documents: DocumentWithFiles[]
}

export const UngroupedCard = memo(function UngroupedCard({ documents }: UngroupedCardProps) {
  if (documents.length === 0) return null

  return (
    <Card className="flex flex-col border-0 shadow-none rounded-[2.5rem] bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="truncate">Без папки</span>
          </CardTitle>
          <Badge variant="outline" className="shrink-0 ml-2">
            {documents.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0 pb-4">
        <div className="space-y-0.5">
          {documents.map((doc) => (
            <DocumentItem key={doc.id} document={doc} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
})
