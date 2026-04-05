/**
 * Типы для ImageBlock extension. Вынесены, чтобы image-block-view
 * мог импортировать их без цикла с image-block.ts.
 */

export type ImageSize = 'small' | 'medium' | 'large' | 'original'
export type ImageRounded = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ImageBorderWidth = 'none' | 'thin' | 'medium' | 'thick'
export type ImageShadow = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ImageWidth = 'auto' | '20' | '40' | '60' | '80' | '100'
