"use client"
/* eslint-disable @next/next/no-img-element -- Tiptap NodeView: next/image не совместим с кастомными node views */

import { NodeViewWrapper, NodeViewProps } from '@tiptap/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ImageIcon, Trash2, Settings } from 'lucide-react'
import { InlineColorPicker } from './inline-color-picker'
import type {
  ImageSize,
  ImageRounded,
  ImageBorderWidth,
  ImageShadow,
  ImageWidth,
} from '../extensions/image-block-types'

const sizeConfig: Record<Exclude<ImageSize, 'original'>, { height: number }> = {
  small: { height: 200 },
  medium: { height: 350 },
  large: { height: 500 },
}

const roundedClasses: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-xl',
  md: 'rounded-2xl',
  lg: 'rounded-3xl',
  xl: 'rounded-[2rem]',
}

const shadowStyles: Record<string, string> = {
  none: '',
  sm: '0 0 8px rgba(0,0,0,0.12)',
  md: '0 0 16px rgba(0,0,0,0.15)',
  lg: '0 0 28px rgba(0,0,0,0.18)',
  xl: '0 0 40px rgba(0,0,0,0.22)',
}

const borderWidthValues: Record<string, number> = {
  none: 0,
  thin: 1,
  medium: 2,
  thick: 4,
}

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
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8">
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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Изображение</Label>
                  <Input
                    placeholder="https://..."
                    value={src || ''}
                    onChange={(e) => updateAttributes({ src: e.target.value })}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Alt текст</Label>
                  <Input
                    placeholder="Описание изображения"
                    value={alt || ''}
                    onChange={(e) => updateAttributes({ alt: e.target.value })}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Подпись</Label>
                  <Input
                    placeholder="Подпись под изображением"
                    value={caption || ''}
                    onChange={(e) => updateAttributes({ caption: e.target.value })}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Высота</Label>
                  <ToggleGroup
                    type="single"
                    value={size}
                    onValueChange={(value) => value && updateAttributes({ size: value })}
                  >
                    <ToggleGroupItem value="original" className="px-3">
                      Ориг.
                    </ToggleGroupItem>
                    <ToggleGroupItem value="small" className="px-3">
                      S
                    </ToggleGroupItem>
                    <ToggleGroupItem value="medium" className="px-3">
                      M
                    </ToggleGroupItem>
                    <ToggleGroupItem value="large" className="px-3">
                      L
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Ширина</Label>
                  <ToggleGroup
                    type="single"
                    value={width}
                    onValueChange={(value) => value && updateAttributes({ width: value })}
                  >
                    <ToggleGroupItem value="auto" className="px-3">
                      Ориг.
                    </ToggleGroupItem>
                    <ToggleGroupItem value="20" className="px-3">
                      20%
                    </ToggleGroupItem>
                    <ToggleGroupItem value="40" className="px-3">
                      40%
                    </ToggleGroupItem>
                    <ToggleGroupItem value="60" className="px-3">
                      60%
                    </ToggleGroupItem>
                    <ToggleGroupItem value="80" className="px-3">
                      80%
                    </ToggleGroupItem>
                    <ToggleGroupItem value="100" className="px-3">
                      100%
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Скругление</Label>
                  <ToggleGroup
                    type="single"
                    value={rounded}
                    onValueChange={(value) => value && updateAttrsAndSaveStyle({ rounded: value })}
                  >
                    <ToggleGroupItem value="none" className="px-3">
                      Нет
                    </ToggleGroupItem>
                    <ToggleGroupItem value="sm" className="px-3">
                      S
                    </ToggleGroupItem>
                    <ToggleGroupItem value="md" className="px-3">
                      M
                    </ToggleGroupItem>
                    <ToggleGroupItem value="lg" className="px-3">
                      L
                    </ToggleGroupItem>
                    <ToggleGroupItem value="xl" className="px-3">
                      XL
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Контур</Label>
                  <ToggleGroup
                    type="single"
                    value={borderWidth}
                    onValueChange={(value) =>
                      value && updateAttrsAndSaveStyle({ borderWidth: value })
                    }
                  >
                    <ToggleGroupItem value="none" className="px-3">
                      Нет
                    </ToggleGroupItem>
                    <ToggleGroupItem value="thin" className="px-3">
                      Тонкий
                    </ToggleGroupItem>
                    <ToggleGroupItem value="medium" className="px-3">
                      Средний
                    </ToggleGroupItem>
                    <ToggleGroupItem value="thick" className="px-3">
                      Толстый
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {borderWidth !== 'none' && (
                    <InlineColorPicker
                      value={borderColor}
                      onChange={(color) => updateAttrsAndSaveStyle({ borderColor: color })}
                      title="Цвет контура"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 w-24">Тень</Label>
                  <ToggleGroup
                    type="single"
                    value={shadow}
                    onValueChange={(value) => value && updateAttrsAndSaveStyle({ shadow: value })}
                  >
                    <ToggleGroupItem value="none" className="px-3">
                      Нет
                    </ToggleGroupItem>
                    <ToggleGroupItem value="sm" className="px-3">
                      S
                    </ToggleGroupItem>
                    <ToggleGroupItem value="md" className="px-3">
                      M
                    </ToggleGroupItem>
                    <ToggleGroupItem value="lg" className="px-3">
                      L
                    </ToggleGroupItem>
                    <ToggleGroupItem value="xl" className="px-3">
                      XL
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={deleteNode}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </figure>
    </NodeViewWrapper>
  )
}
