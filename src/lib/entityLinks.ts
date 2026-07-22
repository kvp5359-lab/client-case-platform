/**
 * Ссылки на сущности воркспейса — одно место на проект.
 *
 * Тред не имеет своей страницы: он открывается в правой панели, которая
 * монтируется в WorkspaceLayout и умеет восстанавливаться из `?panelTab=`
 * (см. useThreadFromPanelTab). Поэтому ссылка на тред — это страница проекта
 * с panelTab, а для тредов без проекта (личные диалоги TG/Wazzup/Email) —
 * /inbox, где panelTab резолвится в scope.
 *
 * UUID в panelTab допустим: middleware (src/proxy.ts) редиректит его на
 * короткий id.
 */

export function projectHref(workspaceId: string, projectId: string): string {
  return `/workspaces/${workspaceId}/projects/${projectId}`
}

export function threadHref(
  workspaceId: string,
  threadId: string,
  projectId?: string | null,
): string {
  const panel = `panelTab=thread:${encodeURIComponent(threadId)}`
  return projectId
    ? `/workspaces/${workspaceId}/projects/${projectId}?${panel}`
    : `/workspaces/${workspaceId}/inbox?${panel}`
}

export function knowledgeArticleHref(workspaceId: string, articleId: string): string {
  return `/workspaces/${workspaceId}/knowledge-base/${articleId}`
}

/* ─────────────────────────── Клик по строке-ссылке ───────────────────────────
 * Строки инбокса/досок/списков и тост уведомления — это <a href>, чтобы средний
 * клик и Cmd/Ctrl+клик открывали тред в новой вкладке НАТИВНО. Обычный левый
 * клик перехватываем и открываем в панели (SPA). Логика одна на все места —
 * держим здесь, рядом с построением самих ссылок.
 */

/** Интерактивные потомки строки: их клик не должен уводить по ссылке.
 *  ⚠️ Без `a` — сама строка является якорем, closest('a') матчил бы всегда. */
const INTERACTIVE_INSIDE_LINK = 'button, [role="button"], [role="menuitem"], input, select, textarea'

/** Минимум полей клика — подходит и React.MouseEvent, и ручной createElement. */
type LinkMouseEvent = {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
  target: EventTarget | null
  preventDefault: () => void
}

/** Клик «в новую вкладку/окно» — отдаём браузеру, ничего не перехватываем. */
export function isModifiedClick(
  e: Pick<LinkMouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'button'>,
): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

/**
 * Пара обработчиков для строки-ссылки. Спредить в <a href>:
 *   <a href={threadHref(...)} {...entityLinkClickHandlers(onOpen)} />
 *
 * 🪤 Гард именно в ФАЗЕ ПЕРЕХВАТА (onClickCapture), а не в onClick: внутренние
 * контролы строки (статус, срок, исполнители, «прочитано») гасят всплытие через
 * stopPropagation, и обработчик на самом якоре для них бы не вызвался вообще —
 * браузер увёл бы по ссылке. Перехват отрабатывает ДО потомка, поэтому
 * stopPropagation на него не влияет. preventDefault в перехвате отменяет
 * переход так же надёжно (stopPropagation переход НЕ отменяет).
 */
export function entityLinkClickHandlers(onOpen: () => void) {
  return {
    onClickCapture: (e: LinkMouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest(INTERACTIVE_INSIDE_LINK)) e.preventDefault()
    },
    onClick: (e: LinkMouseEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest(INTERACTIVE_INSIDE_LINK)) return
      if (isModifiedClick(e)) return
      e.preventDefault()
      onOpen()
    },
  }
}
