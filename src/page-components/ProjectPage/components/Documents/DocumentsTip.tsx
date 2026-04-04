"use client"

/**
 * Подсказка для новых пользователей на вкладке «Документы»
 * Скрывается по крестику, состояние хранится в localStorage
 */

import { useState } from 'react'
import { X, Lightbulb, Upload, FileUp } from 'lucide-react'

const STORAGE_KEY = 'documents-tip-dismissed'

export function DocumentsTip() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')

  if (dismissed) return null

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="relative flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-[13px] text-blue-900/80 leading-relaxed">
      <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
      <div className="pr-4">
        Загружайте документы в нужную папку кнопкой{' '}
        <span className="inline-flex items-center gap-1 h-5 px-2 text-[12px] text-blue-600 border border-dashed border-blue-400 rounded-md -translate-y-0.5 align-text-top">
          <Upload className="h-3 w-3" />
          Загрузить
        </span>{' '}
        или нажмите на{' '}
        <span className="inline-flex items-center gap-1 h-5 px-2.5 text-[12px] text-blue-600 border border-dashed border-blue-400 rounded-full -translate-y-0.5 align-text-top">
          <FileUp className="h-3 w-3" />
          слот
        </span>
        , чтобы загрузить документ прямо в него.
        <br />
        Нажмите{' '}
        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-blue-400 text-[10px] font-medium text-blue-500 align-text-top">
          ?
        </span>{' '}
        рядом с названием папки, чтобы увидеть требования к документам.
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-0.5 rounded text-blue-400 hover:text-blue-600 transition-colors"
        aria-label="Скрыть подсказку"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
