"use client"

/**
 * Хук для анализа сжатия PDF-документов
 */

import { useCallback, useMemo, useState } from 'react'
import {
  estimateCompression,
  type CompressAnalysisItem,
} from '@/components/documents/dialogs/CompressAnalysisDialog'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import { getCurrentDocumentFile } from '@/utils/documentUtils'

interface UseCompressAnalysisParams {
  documentKits: DocumentKitWithDocuments[]
}

export function useCompressAnalysis({ documentKits }: UseCompressAnalysisParams) {
  const [compressAnalysisOpen, setCompressAnalysisOpen] = useState(false)
  const [highlightedCompressDocIds, setHighlightedCompressDocIds] = useState<Set<string>>(new Set())

  const clearHighlightedCompressDocs = useCallback(() => {
    setHighlightedCompressDocIds(new Set())
  }, [])

  const compressAnalysisItems = useMemo<CompressAnalysisItem[]>(() => {
    const items: CompressAnalysisItem[] = []
    for (const kit of documentKits) {
      const folders = kit.folders || []
      const folderMap = new Map(folders.map((f) => [f.id, f.name]))
      for (const doc of kit.documents || []) {
        if (doc.is_deleted) continue
        const currentFile = getCurrentDocumentFile(doc.document_files)
        if (!currentFile || currentFile.mime_type !== 'application/pdf') continue
        const size = currentFile.file_size || 0
        if (size <= 0) continue
        const { estimatedSize, savingsPercent } = estimateCompression(size)
        items.push({
          docId: doc.id,
          docName: doc.name,
          currentSize: size,
          estimatedSize,
          savingsPercent,
          folderName: doc.folder_id ? folderMap.get(doc.folder_id) || null : null,
        })
      }
    }
    return items.sort((a, b) => b.savingsPercent - a.savingsPercent)
  }, [documentKits])

  const handleHighlightCompressDocs = useCallback((docIds: string[]) => {
    setHighlightedCompressDocIds(new Set(docIds))
  }, [])

  return {
    compressAnalysisOpen,
    setCompressAnalysisOpen,
    highlightedCompressDocIds,
    clearHighlightedCompressDocs,
    compressAnalysisItems,
    handleHighlightCompressDocs,
  }
}
