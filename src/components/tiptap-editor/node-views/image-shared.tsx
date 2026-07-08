"use client"

import type { DOMOutputSpec } from '@tiptap/pm/model'
import { mergeAttributes } from '@tiptap/core'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { InlineColorPicker } from './inline-color-picker'

// Единый источник карт стилей для ImageBlock и ImageSpoiler.
export const roundedClasses: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-xl',
  md: 'rounded-2xl',
  lg: 'rounded-3xl',
  xl: 'rounded-[2rem]',
}
export const shadowStyles: Record<string, string> = {
  none: '',
  sm: '0 0 8px rgba(0,0,0,0.12)',
  md: '0 0 16px rgba(0,0,0,0.15)',
  lg: '0 0 28px rgba(0,0,0,0.18)',
  xl: '0 0 40px rgba(0,0,0,0.22)',
}
export const borderWidthValues: Record<string, number> = {
  none: 0,
  thin: 1,
  medium: 2,
  thick: 4,
}
export const sizeConfig: Record<string, { height: number }> = {
  small: { height: 200 },
  medium: { height: 350 },
  large: { height: 500 },
}

export type ImageStyleAttrs = {
  src: string
  alt?: string
  caption?: string
  size?: string
  width?: string
  borderWidth?: string
  borderColor?: string
  rounded?: string
  shadow?: string
}

/**
 * DOMOutputSpec для статичного HTML картинки (<figure data-type="image-block">).
 * Единый рендер для ImageBlock и раскрытой картинки ImageSpoiler — стили
 * (скругление/рамка/тень/ширина) считаются одинаково.
 */
export function imageFigureSpec(
  attrs: Record<string, string>,
  baseAttrs: Record<string, string> = {},
): DOMOutputSpec {
  const roundedClass = roundedClasses[attrs.rounded] || roundedClasses.lg
  const shadowValue = shadowStyles[attrs.shadow] || ''
  const bw = borderWidthValues[attrs.borderWidth] || 0
  const borderColor = attrs.borderColor || '#d1d5db'
  const borderInline = bw > 0 ? `border: ${bw}px solid ${borderColor};` : ''
  const shadowInline = shadowValue ? `box-shadow: ${shadowValue};` : ''
  const widthStyle = !attrs.width || attrs.width === 'auto' ? 'fit-content' : `${attrs.width}%`

  return [
    'figure',
    mergeAttributes(baseAttrs, {
      'data-type': 'image-block',
      'data-size': attrs.size || 'original',
      'data-width': attrs.width || 'auto',
      'data-border-width': attrs.borderWidth || 'none',
      'data-border-color': borderColor,
      'data-rounded': attrs.rounded || 'lg',
      'data-shadow': attrs.shadow || 'none',
      class: `my-6 ${roundedClass} overflow-hidden`,
      style: `display: block; width: ${widthStyle}; ${borderInline} ${shadowInline}`,
    }),
    [
      'img',
      {
        src: attrs.src,
        alt: attrs.alt || '',
        class: `w-full h-auto ${roundedClass}`,
        style: 'max-width: 100%; height: auto; display: block;',
      },
    ],
    attrs.caption
      ? ['figcaption', { class: 'text-center text-sm text-gray-500 mt-2' }, attrs.caption]
      : '',
  ]
}

type SettingsProps = {
  attrs: ImageStyleAttrs
  updateAttributes: (attrs: Record<string, unknown>) => void
  updateAttrsAndSaveStyle: (attrs: Record<string, unknown>) => void
}

/**
 * Форма настроек картинки (Alt/подпись/высота/ширина/скругление/контур/тень).
 * Общая для ImageBlock и ImageSpoiler — рендерится внутри Popover.
 */
export function ImageSettingsFields({
  attrs,
  updateAttributes,
  updateAttrsAndSaveStyle,
}: SettingsProps) {
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
  } = attrs

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0">Изображение</Label>
        <Input
          placeholder="https://..."
          value={src || ''}
          onChange={(e) => updateAttributes({ src: e.target.value })}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0">Alt текст</Label>
        <Input
          placeholder="Описание изображения"
          value={alt || ''}
          onChange={(e) => updateAttributes({ alt: e.target.value })}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0">Подпись</Label>
        <Input
          placeholder="Подпись под изображением"
          value={caption || ''}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-24 shrink-0">Высота</Label>
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
        <Label className="w-24 shrink-0">Ширина</Label>
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
        <Label className="w-24 shrink-0">Скругление</Label>
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
        <Label className="w-24 shrink-0">Контур</Label>
        <ToggleGroup
          type="single"
          value={borderWidth}
          onValueChange={(value) => value && updateAttrsAndSaveStyle({ borderWidth: value })}
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
        <Label className="w-24 shrink-0">Тень</Label>
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
  )
}
