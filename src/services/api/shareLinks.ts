/**
 * Сервис шеринг-ссылок для клиента.
 * - getProjectShareableResources — собрать статьи + внешние ссылки проекта.
 * - ensureArticleShareLink / regenerateArticleShareLink — получить/пересоздать
 *   публичную ссылку на статью в контексте проекта.
 *
 * Публичный резолвер get_shared_article вызывается на самой публичной странице
 * (src/app/a/[token]/page.tsx), здесь его нет.
 */

import { supabase } from '@/lib/supabase'

export type ShareableArticle = {
  article_id: string
  title: string
  /** Активный токен, если ссылка уже создавалась; иначе null. */
  token: string | null
  /** Группа базы знаний, к которой относится статья (или null — «Без группы»). */
  group_name: string | null
}

export type ShareableExternal = {
  kind: 'drive_folder' | 'form' | 'brief' | 'kit_folder' | 'doc_folder' | 'source_doc' | string
  label: string
  url: string
  /** Для kit_folder/doc_folder — id набора документов (иерархия подпапок). */
  kit_id?: string | null
  /** Идентификатор узла (для дерева по реальной структуре Диска). */
  id?: string
  /** Родитель в дереве; null — корень. Есть только у «живого» Drive-дерева. */
  parent_id?: string | null
  /** Доп. подпись серым после названия (реальное имя папки Диска у корня). */
  sub_label?: string | null
}

/**
 * Узел дерева документов проекта (вкладка «Описания документов»).
 * Папки и слоты приходят ВСЕ, включая те, к которым не привязана статья:
 * article_id/token у них null — такой узел вставляется в сообщение просто
 * названием, без ссылки.
 */
export type ShareableDocSlot = {
  slot_id: string
  name: string
  article_id: string | null
  /** Активный токен статьи, если ссылка уже создавалась; иначе null. */
  token: string | null
  /** Документ загружен в слот (и не в корзине) — см. режим uploadedDisplay. */
  has_document: boolean
}

export type ShareableDocFolder = {
  folder_id: string
  name: string
  article_id: string | null
  token: string | null
  slots: ShareableDocSlot[]
}

export type ShareableDocKit = {
  kit_id: string
  name: string
  folders: ShareableDocFolder[]
}

export type ProjectShareables = {
  articles: ShareableArticle[]
  external: ShareableExternal[]
  /** Дерево вкладки «Документы»: набор → папки → слоты. */
  doc_tree: ShareableDocKit[]
}

export async function getProjectShareableResources(projectId: string): Promise<ProjectShareables> {
  const { data, error } = await supabase.rpc('get_project_shareable_resources', {
    p_project_id: projectId,
  })
  if (error) throw error
  const obj = (data ?? {}) as {
    articles?: ShareableArticle[]
    external?: ShareableExternal[]
    doc_tree?: ShareableDocKit[]
  }
  return {
    articles: obj.articles ?? [],
    external: obj.external ?? [],
    doc_tree: obj.doc_tree ?? [],
  }
}

/**
 * Реальная структура папок проекта на Google Drive (вкладка «Внешние») —
 * читается прямо у Google Drive, чтобы дерево совпадало с Диском (включая
 * реальную папку брифа). Возвращает узлы с id/parent_id.
 *
 * null — если Диск не подключён / не удалось прочитать: вызывающий откатывается
 * на дерево из БД (get_project_shareable_resources.external).
 */
export async function getProjectDriveExternalTree(
  projectId: string,
): Promise<ShareableExternal[] | null> {
  const { data, error } = await supabase.functions.invoke('google-drive-shareable-tree', {
    body: { p_project_id: projectId, projectId },
  })
  if (error) return null
  const nodes = (data as { ok?: boolean; nodes?: ShareableExternal[] } | null)?.nodes
  if (!nodes || nodes.length === 0) return null
  return nodes
}

export async function ensureArticleShareLink(articleId: string, projectId: string): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_article_share_link', {
    p_article_id: articleId,
    p_project_id: projectId,
  })
  if (error) throw error
  return data as string
}

export async function regenerateArticleShareLink(
  articleId: string,
  projectId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_article_share_link', {
    p_article_id: articleId,
    p_project_id: projectId,
  })
  if (error) throw error
  return data as string
}

/**
 * Публичный host для share-ссылок, когда адресу вкладки доверять нельзя.
 * `/a/<token>` — host-agnostic (см. src/proxy.ts), поэтому портал годится для
 * любого воркспейса.
 */
const PUBLIC_SHARE_ORIGIN = 'https://my.clientcase.app'

/**
 * Origin, с которого НЕЛЬЗЯ строить ссылку клиенту (адрес машины разработчика).
 *
 * Главный признак — протокол: прод всегда за https (см. src/proxy.ts — все
 * редиректы только на https), локальный dev — http. Это закрывает и localhost,
 * и LAN-IP (`http://192.168.x.x:8080` — dev, открытый с телефона), и IPv6.
 * Явный список хостов оставлен на случай https на локалке (self-signed).
 */
export function isLocalShareOrigin(location: { protocol: string; hostname: string }): boolean {
  if (location.protocol !== 'https:') return true
  const h = location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local')
  )
}

/**
 * Построить полный публичный URL по токену — на текущем host'е воркспейса.
 * Вне браузера (SSR) — сразу канонический публичный origin (не относительный
 * путь, как раньше: ссылка предназначена для копирования/отправки наружу).
 *
 * 🪤 На локальном dev адрес вкладки — localhost, а БД общая с продом: ссылка
 * `http://localhost:8080/a/…` реально уходила клиенту в Telegram (который её
 * молча выбрасывает — оставался голый текст) и в любом случае не открылась бы
 * (инцидент 2026-07-22, список документов «молнией»). Для локальных origin'ов
 * подставляем канонический публичный.
 */
export function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return `${PUBLIC_SHARE_ORIGIN}/a/${token}`
  const loc = window.location
  return `${isLocalShareOrigin(loc) ? PUBLIC_SHARE_ORIGIN : loc.origin}/a/${token}`
}
