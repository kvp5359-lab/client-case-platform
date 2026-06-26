"use client"

/**
 * AccentThemeStyle — инжектит CSS-переменные настраиваемой палитры воркспейса.
 *
 * Карты стилей акцентов используют `var(--acc-<slug>-<tone>, <дефолтный hex>)`.
 * Здесь мы определяем `--acc-<slug>-<tone>` ТОЛЬКО для переопределённых
 * воркспейсом цветов (workspaces.accent_overrides). Где не задано — берётся
 * дефолтный фолбэк из самого класса → вид не меняется.
 *
 * Монтируется один раз в layout воркспейса.
 */

import { useParams } from 'next/navigation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { buildAccentOverridesCss, type AccentOverrides } from '@/lib/accentPalette'

export function AccentThemeStyle() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: workspace } = useWorkspace(workspaceId)
  const css = buildAccentOverridesCss(
    (workspace?.accent_overrides as AccentOverrides | null) ?? null,
  )
  if (!css) return null
  return <style id="cc-accent-overrides" dangerouslySetInnerHTML={{ __html: css }} />
}
