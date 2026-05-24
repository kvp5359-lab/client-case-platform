"use client"

/**
 * Split-button «Перевести» в тулбаре композера.
 *
 *  ┌────────────┐┌───┐
 *  │ 🌐  EN     ││ ▼ │
 *  └────────────┘└───┘
 *
 * Левая часть — основной клик: моментально переводит на угаданный target-язык
 * (useThreadTargetLanguage). Правая часть со стрелкой — popover со списком
 * языков для ручного выбора. Выбор из списка запоминается как новый default
 * для этого треда (и глобально).
 */

import { useState } from 'react'
import { Languages, Loader2, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TRANSLATION_LANGUAGES, useMyPreferredLanguage } from '@/hooks/useMyPreferredLanguage'
import { useTranslatePreview } from '@/hooks/messenger/useTranslateMessage'
import { useThreadTargetLanguage } from '@/hooks/messenger/useThreadTargetLanguage'
import { cn } from '@/lib/utils'

type Props = {
  workspaceId: string
  threadId?: string
  getCurrentContent: () => string
  onTranslated: (input: {
    originalContent: string
    translatedContent: string
    targetLanguage: string
    sourceLanguage: string | null
  }) => void
  disabled?: boolean
}

export function TranslateActionButton({
  workspaceId,
  threadId,
  getCurrentContent,
  onTranslated,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const { data: myLang } = useMyPreferredLanguage()
  const translate = useTranslatePreview()
  const { target, setTarget } = useThreadTargetLanguage(threadId)

  const runTranslation = (lang: string) => {
    const content = getCurrentContent()
    if (!content || !content.replace(/<[^>]+>/g, '').trim()) return
    translate.mutate(
      { workspaceId, content, targetLanguage: lang, sourceLanguage: myLang || undefined, threadId },
      {
        onSuccess: (data) => {
          onTranslated({
            originalContent: content,
            translatedContent: data.translated_content,
            targetLanguage: data.target_language,
            sourceLanguage: data.source_language ?? myLang ?? null,
          })
        },
      },
    )
  }

  const handleQuickTranslate = () => {
    if (disabled || translate.isPending) return
    runTranslation(target)
  }

  const handlePickFromMenu = (lang: string) => {
    setTarget(lang)
    setOpen(false)
    runTranslation(lang)
  }

  const buttonBase =
    'h-8 inline-flex items-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors'

  return (
    <div className="inline-flex items-center">
      {/* Левая часть: моментальный перевод на угаданный target */}
      <button
        type="button"
        onClick={handleQuickTranslate}
        disabled={disabled || translate.isPending}
        className={cn(buttonBase, 'gap-1 pl-1.5 pr-1 rounded-l-md')}
        title={`Перевести на ${target.toUpperCase()}`}
      >
        {translate.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Languages className="h-4 w-4" />
        )}
        <span className="text-[10px] font-semibold uppercase leading-none tracking-wide">
          {target}
        </span>
      </button>
      {/* Правая часть: треугольник, открывает popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || translate.isPending}
            className={cn(buttonBase, 'px-0.5 rounded-r-md border-l border-transparent hover:border-border')}
            title="Выбрать другой язык"
            aria-label="Выбрать другой язык"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start" side="top">
          <div className="text-xs text-muted-foreground px-2 py-1.5">Перевести на:</div>
          <div className="max-h-64 overflow-y-auto">
            {TRANSLATION_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handlePickFromMenu(l.code)}
                className={cn(
                  'w-full flex items-center px-2 py-1.5 text-sm hover:bg-muted rounded text-left',
                  l.code === target && 'bg-muted/70',
                )}
              >
                {l.label}
                <span className="ml-auto text-xs text-muted-foreground uppercase">{l.code}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
