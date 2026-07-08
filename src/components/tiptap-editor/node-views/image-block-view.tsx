"use client"
/* eslint-disable @next/next/no-img-element -- Tiptap NodeView: next/image не совместим с кастомными node views */

import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ImageIcon, Trash2, Settings } from 'lucide-react'
import {
  roundedClasses,
  shadowStyles,
  borderWidthValues,
  sizeConfig,
  ImageSettingsFields,
} from './image-shared'
import type {
  ImageSize,
  ImageRounded,
  ImageBorderWidth,
  ImageShadow,
  ImageWidth,
} from '../extensions/image-block-types'

export function ImageBlockView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const {
    src,
    alt,
    caption,
    size = 'original',
    width = 'auto',
    borderWidth = 'none',
    borderColor = '#d1d5db',
    rounded = 'lg',
    shadow = 'none',
  } = node.attrs as {
    src: string
    alt: string
    caption: string
    size: ImageSize
    width: ImageWidth
    borderWidth: ImageBorderWidth
    borderColor: string
    rounded: ImageRounded
    shadow: ImageShadow
  }

  const [settingsOpen, setSettingsOpen] = useState(false)

  const updateAttrsAndSaveStyle = (attrs: Record<string, unknown>) => {
    updateAttributes(attrs)
    const styleKeys = ['rounded', 'borderWidth', 'borderColor', 'shadow']
    if (styleKeys.some((k) => k in attrs)) {
      const current = { rounded, borderWidth, borderColor, shadow }
      const updated = { ...current, ...attrs }
      try {
        localStorage.setItem('imageBlock:lastStyle', JSON.stringify(updated))
      } catch {
        /* ignore */
      }
    }
  }

  const isOriginal = size === 'original'
  const roundedClass = roundedClasses[rounded] || 'rounded-lg'
  const shadowValue = shadowStyles[shadow] || ''
  const bw = borderWidthValues[borderWidth] || 0
  const figureStyle: React.CSSProperties = {
    ...(bw > 0 ? { border: `${bw}px solid ${borderColor}` } : {}),
    ...(shadowValue ? { boxShadow: shadowValue } : {}),
  }

  return (
    <NodeViewWrapper
      className={`my-4 ${selected ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
      style={{ width: width === 'auto' ? 'fit-content' : `${width}%` }}
    >
      <figure
        className={`relative group !mt-0 !mb-0 ${roundedClass} overflow-hidden`}
        style={figureStyle}
      >
        {src ? (
          <>
            {isOriginal ? (
              <div className={`relative w-full overflow-hidden ${roundedClass}`}>
                <img
                  src={src}
                  alt={alt || ''}
                  className="w-full h-auto !m-0 block"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>
            ) : (
              <div
                className={`relative w-full overflow-hidden ${roundedClass}`}
                style={{
                  height: sizeConfig[size as Exclude<ImageSize, 'original'>]?.height || 350,
                }}
              >
                <img src={src} alt={alt || ''} className="w-full h-full object-cover !m-0 block" />
              </div>
            )}
            {caption && (
              <figcaption className="text-center text-sm text-muted-foreground mt-2 px-2 pb-2">
                {caption}
              </figcaption>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 bg-muted/30 rounded-lg border border-dashed">
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Изображение не выбрано</p>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8" aria-label="Настройки изображения">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[480px]"
              align="end"
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
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={deleteNode} aria-label="Удалить изображение">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </figure>
    </NodeViewWrapper>
  )
}
