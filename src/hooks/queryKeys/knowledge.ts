/**
 * Query keys для базы знаний (статьи, группы, поиск, Q&A).
 */

export const knowledgeBaseKeys = {
  all: ['knowledge-base'] as const,
  articles: (workspaceId: string) => ['knowledge-base', 'articles', workspaceId] as const,
  article: (articleId: string) => ['knowledge-base', 'article', articleId] as const,
  articleGroups: (articleId: string) => ['knowledge-base', 'article-groups', articleId] as const,
  groups: (workspaceId: string) => ['knowledge-base', 'groups', workspaceId] as const,
  templateArticles: (templateId: string) =>
    ['knowledge-base', 'template-articles', templateId] as const,
  templateGroups: (templateId: string) =>
    ['knowledge-base', 'template-groups', templateId] as const,
  projectArticles: (templateId: string) =>
    ['knowledge-base', 'project-articles', templateId] as const,
  // Доступ: какие шаблоны привязаны к группе/статье
  groupAccess: (groupId: string) => ['knowledge-base', 'group-access', groupId] as const,
  articleAccess: (articleId: string) => ['knowledge-base', 'article-access', articleId] as const,
  // AI-поиск
  conversations: (workspaceId: string, projectId?: string) =>
    ['knowledge-base', 'conversations', workspaceId, projectId ?? 'admin'] as const,
  messages: (conversationId: string) => ['knowledge-base', 'messages', conversationId] as const,
  indexStatus: (articleId: string) => ['knowledge-base', 'index-status', articleId] as const,
  // Версии
  versions: (articleId: string) => ['knowledge-base', 'versions', articleId] as const,
  version: (versionId: string) => ['knowledge-base', 'version', versionId] as const,
  // Теги
  tags: (workspaceId: string) => ['knowledge-base', 'tags', workspaceId] as const,
  // Q&A
  qa: (workspaceId: string) => ['knowledge-base', 'qa', workspaceId] as const,
}

/**
 * Knowledge-article/group cross-лукапы, не покрытые knowledgeBaseKeys.
 */
export const knowledgeListKeys = {
  /** Плоский список статей workspace (без join/group). */
  articlesList: (workspaceId: string | undefined) =>
    ['knowledge-articles-list', workspaceId] as const,
  /** Связи статей с группами: (article_id, group_id). Используется для
   *  построения дерева и фильтров по группам. */
  articleGroupLinks: (workspaceId: string | undefined) =>
    ['knowledge-article-groups', workspaceId] as const,
  knowledgeTree: (workspaceId: string | undefined) =>
    ['knowledge-tree', workspaceId] as const,
  articleTags: (articleId: string | undefined) =>
    ['knowledge-base', 'article-tags', articleId] as const,
}
