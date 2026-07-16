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
