"use client"
/* eslint-disable @next/next/no-img-element -- Tiptap NodeView: next/image не совместим с кастомными node views */

import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Pencil, X, ImageIcon, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  roundedClasses,
  shadowStyles,
  borderWidthValues,
  sizeConfig,
  ImageSettingsFields,
} from './image-shared'

// «Открыто» и состояние попапа настроек храним по uid ноды вне React-стейта:
// смена атрибута (размер/тень/…) пере-инициализирует node-view (ре-парс/ремоунт),
// и локальный useState сбросился бы в false → картинка сворачивалась при каждой
// правке. Стор по uid переживает ремоунт (uid стабилен, round-trip через data-uid).
const openStore = new Map<string, boolean>()
const settingsStore = new Map<string, boolean>()

export function ImageSpoilerView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const {
    src,
    alt = '',
    label = 'подсказка',
    caption = '',
    size = 'original',
    width = 'auto',
    borderWidth = 'none',
    borderColor = '#d1d5db',
    rounded = 'lg',
    shadow = 'none',
  } = node.attrs as Record<string, string>

  const uid = (node.attrs.uid as string) || 'default'

  // «Открыто»/«настройки открыты» — вне React-стейта (см. коммент к openStore).
  // В документ не пишем: статья всегда грузится свёрнутой.
  const [open, setOpenRaw] = useState<boolean>(() => openStore.get(uid) ?? false)
  const setOpen = (updater: boolean | ((prev: boolean) => boolean)) =>
    setOpenRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      openStore.set(uid, next)
      return next
    })
  const [settingsOpen, setSettingsRaw] = useState<boolean>(() => settingsStore.get(uid) ?? false)
  const setSettingsOpen = (updater: boolean | ((prev: boolean) => boolean)) =>
    setSettingsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      settingsStore.set(uid, next)
      return next
    })
  const [editLabel, setEditLabel] = useState(false)
  const [labelInput, setLabelInput] = useState(label)

  const saveLabel = () => {
    updateAttributes({ label: labelInput.trim() || 'подсказка' })
    setEditLabel(false)
  }

  // Как в ImageBlockView: стилевые правки запоминаем для следующих картинок.
  const updateAttrsAndSaveStyle = (attrs: Record<string, unknown>) => {
    updateAttributes(attrs)
    const styleKeys = ['rounded', 'borderWidth', 'borderColor', 'shadow']
    if (styleKeys.some((k) => k in attrs)) {
      const updated = { rounded, borderWidth, borderColor, shadow, ...attrs }
      try {
        localStorage.setItem('imageBlock:lastStyle', JSON.stringify(updated))
      } catch {
        /* ignore */
      }
    }
  }

  const roundedClass = roundedClasses[rounded] || 'rounded-lg'
  const shadowValue = shadowStyles[shadow] || ''
  const bw = borderWidthValues[borderWidth] || 0
  const figureStyle: React.CSSProperties = {
    ...(bw > 0 ? { border: `${bw}px solid ${borderColor}` } : {}),
    ...(shadowValue ? { boxShadow: shadowValue } : {}),
  }
  const isOriginal = size === 'original'

  return (
    <NodeViewWrapper
      as="span"
      className={cn('image-spoiler-nv not-prose inline', selected && 'rounded ring-2 ring-primary')}
      contentEditable={false}
    >
      {editLabel ? (
        <span className="inline-flex align-middle" onMouseDown={(e) => e.stopPropagation()}>
          <Input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            className="h-6 w-36 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveLabel()
              }
              if (e.key === 'Escape') {
                setLabelInput(label)
                setEditLabel(false)
              }
            }}
            onBlur={saveLabel}
          />
        </span>
      ) : (
        <span
          className="group inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 align-middle text-[0.85em] font-medium text-primary cursor-pointer select-none"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Свернуть картинку' : 'Показать картинку'}
        >
          <ImageIcon className="h-3 w-3 flex-shrink-0" />
          <span>{label}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLabelInput(label)
              setEditLabel(true)
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary/60"
            title="Переименовать"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary/60"
                title="Настройки картинки"
              >
                <Settings className="h-2.5 w-2.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[480px]"
              align="start"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDownOutside={(e) => {
                const target = e.target as HTMLElement
                if (target.closest('[data-node-view-wrapper]')) {
                  e.preventDefault()
                }
              }}
            >
              <ImageSettingsFields
                attrs={{ src, alt, caption, size, width, borderWidth, borderColor, rounded, shadow }}
                updateAttributes={updateAttributes}
                updateAttrsAndSaveStyle={updateAttrsAndSaveStyle}
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              deleteNode()
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
            title="Удалить"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      )}

      {open && src && (
        <span
          className="mt-1.5 block"
          style={{ width: width === 'auto' ? 'fit-content' : `${width}%` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <figure className={cn('!my-0 overflow-hidden', roundedClass)} style={figureStyle}>
            {isOriginal ? (
              <img src={src} alt={alt} className={cn('block h-auto w-full !m-0', roundedClass)} />
            ) : (
              <span
                className={cn('block w-full overflow-hidden', roundedClass)}
                style={{ height: sizeConfig[size]?.height || 350 }}
              >
                <img src={src} alt={alt} className="block h-full w-full !m-0 object-cover" />
              </span>
            )}
            {caption && (
              <figcaption className="mt-2 px-2 pb-1 text-center text-sm text-muted-foreground">
                {caption}
              </figcaption>
            )}
          </figure>
        </span>
      )}
    </NodeViewWrapper>
  )
}
