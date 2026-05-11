/**
 * База знаний проекта в Telegram-боте: показ дерева групп/статей, вывод
 * статьи постранично, служебные «кто-то открыл статью» события.
 *
 * Helper `resolvePrefixId` живёт здесь — он используется и в knowledge и в
 * upload-slot для резолва короткого id из callback_data в полный UUID.
 */

import { service, PAGE_SIZE } from "./shared.ts";
import { sendMessage, editMessage } from "./tg-api.ts";
import { encode as encodeCb } from "./callback-data.ts";
import { renderArticle } from "./tiptap.ts";
import { findChatBinding } from "./bindings.ts";
import { participantByTgId } from "./participants.ts";
import { formatUserName, escapeHtml } from "./pure.ts";
import type { TgInlineButton, TgInlineKeyboard, TgUser, TgChatBinding } from "./types.ts";

/**
 * Собирает id всех статей, доступных в рамках проекта, через шаблон.
 * Возвращает null, если у проекта нет template_id.
 */
export async function getProjectAccessibleArticleIds(projectId: string): Promise<Set<string> | null> {
  const { data: project } = await service
    .from("projects")
    .select("template_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.template_id) return null;

  const [{ data: articleLinks }, { data: groupLinks }] = await Promise.all([
    service.from("knowledge_article_templates").select("article_id").eq("project_template_id", project.template_id),
    service.from("knowledge_group_templates").select("group_id").eq("project_template_id", project.template_id),
  ]);

  const ids = new Set<string>((articleLinks ?? []).map((l: { article_id: string }) => l.article_id));
  const groupIds = (groupLinks ?? []).map((l: { group_id: string }) => l.group_id);
  if (groupIds.length > 0) {
    const { data: groupArticles } = await service
      .from("knowledge_article_groups")
      .select("article_id")
      .in("group_id", groupIds);
    for (const ga of groupArticles ?? []) ids.add(ga.article_id);
  }
  return ids;
}

export async function showKbGroups(chatId: number, parentGroupId: string | null, page: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  // Список статей, доступных в проекте (через шаблон проекта)
  const accessibleArticleIds = await getProjectAccessibleArticleIds(binding.project_id);
  if (!accessibleArticleIds) {
    const text = "📚 <b>База знаний</b>\n\n<i>Полезные материалы этого проекта ещё не настроены.</i>";
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }
  if (accessibleArticleIds.size === 0) {
    const text = "📚 <b>База знаний</b>\n\n<i>В этом проекте пока нет материалов.</i>";
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Загружаем статьи с их группами — чтобы построить дерево
  const articleIdArray = [...accessibleArticleIds];
  const { data: articlesData } = await service
    .from("knowledge_articles")
    .select("id, title, is_published, knowledge_article_groups(group_id, sort_order)")
    .in("id", articleIdArray)
    .eq("is_published", true);

  type ArticleData = {
    id: string;
    title: string;
    knowledge_article_groups: { group_id: string; sort_order: number | null }[];
  };
  const articlesList = (articlesData ?? []) as ArticleData[];

  // Загружаем все группы workspace, чтобы знать parent_id
  const { data: allGroupsData } = await service
    .from("knowledge_groups")
    .select("id, name, parent_id, sort_order")
    .eq("workspace_id", binding.workspace_id)
    .order("sort_order", { ascending: true });
  type GroupRow = { id: string; name: string; parent_id: string | null; sort_order: number | null };
  const allGroups = (allGroupsData ?? []) as GroupRow[];

  // Плоская структура (как в веб-UI проекта):
  // — группы показываем только те, к которым НАПРЯМУЮ привязаны доступные статьи
  //   (никаких родительских групп дерева не раскручиваем)
  // — статьи без группы идут отдельным списком на корневом экране
  const groupById = new Map(allGroups.map((g) => [g.id, g]));
  const directGroupIds = new Set<string>();
  for (const a of articlesList) {
    for (const ag of a.knowledge_article_groups) directGroupIds.add(ag.group_id);
  }
  const ungroupedArticles = articlesList.filter((a) => a.knowledge_article_groups.length === 0);

  let screenGroups: GroupRow[] = [];
  let screenArticles: { id: string; title: string }[] = [];
  let parentTitle = "База знаний проекта";

  if (parentGroupId === null) {
    // Корень: плоский список всех прямых групп + статьи без группы
    screenGroups = allGroups.filter((g) => directGroupIds.has(g.id));
    screenArticles = ungroupedArticles.map((a) => ({ id: a.id, title: a.title }));
  } else {
    // Внутри группы: только её статьи, без вложенных подгрупп
    const fullId = await resolvePrefixId("knowledge_groups", binding.workspace_id, parentGroupId);
    if (!fullId) {
      const text = "📚 <b>База знаний</b>\n\n<i>Раздел не найден.</i>";
      const kb: TgInlineKeyboard = [[{ text: "↑ К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }]];
      if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
      else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
      return;
    }
    screenArticles = articlesList
      .filter((a) => a.knowledge_article_groups.some((ag) => ag.group_id === fullId))
      .sort((a, b) => {
        const ao = a.knowledge_article_groups.find((ag) => ag.group_id === fullId)?.sort_order ?? 0;
        const bo = b.knowledge_article_groups.find((ag) => ag.group_id === fullId)?.sort_order ?? 0;
        return (ao ?? 0) - (bo ?? 0);
      })
      .map((a) => ({ id: a.id, title: a.title }));
    parentTitle = groupById.get(fullId)?.name ?? "Раздел";
  }

  const groups = screenGroups;
  const articles = screenArticles;

  const items: TgInlineButton[] = [];
  for (const g of groups ?? []) {
    items.push({ text: `📁 ${g.name}`, callback_data: encodeCb({ kind: "kb_group", groupId: g.id, page: 0 }) });
  }
  for (const a of articles) {
    items.push({ text: `📄 ${a.title}`, callback_data: encodeCb({ kind: "kb_article", articleId: a.id }) });
  }

  const total = items.length;
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  const keyboard: TgInlineKeyboard = pageItems.map((b) => [b]);

  // Навигация по страницам
  const navRow: TgInlineButton[] = [];
  if (page > 0) {
    navRow.push({ text: "‹ Назад", callback_data: encodeCb({ kind: "kb_group", groupId: parentGroupId, page: page - 1 }) });
  }
  if (start + PAGE_SIZE < total) {
    navRow.push({ text: "Вперёд ›", callback_data: encodeCb({ kind: "kb_group", groupId: parentGroupId, page: page + 1 }) });
  }
  if (navRow.length) keyboard.push(navRow);

  // Наверх / в главное меню
  if (parentGroupId !== null) {
    keyboard.push([{ text: "↑ К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }]);
  }
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const title = parentGroupId === null
    ? "📚 <b>База знаний проекта</b>"
    : `📚 <b>${escapeHtml(parentTitle)}</b>`;
  const text = total === 0
    ? `${title}\n\n<i>Здесь пока нет материалов.</i>`
    : `${title}\n\nВыберите материал${total > PAGE_SIZE ? ` (стр. ${page + 1}/${Math.ceil(total / PAGE_SIZE)})` : ""}:`;

  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, keyboard);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
}

export async function showArticle(chatId: number, articlePrefix: string, from?: TgUser) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;
  const fullId = await resolvePrefixId("knowledge_articles", binding.workspace_id, articlePrefix);
  if (!fullId) {
    await sendMessage(chatId, "Статья не найдена.");
    return;
  }
  const { data: article } = await service
    .from("knowledge_articles")
    .select("id, title, content, is_published")
    .eq("id", fullId)
    .maybeSingle();

  if (!article || !article.is_published) {
    await sendMessage(chatId, "Статья недоступна.");
    return;
  }

  const chunks = renderArticle(article.title, article.content);
  for (const c of chunks) {
    await sendMessage(chatId, c);
  }
  await sendMessage(chatId, "Что дальше?", {
    reply_markup: {
      inline_keyboard: [[
        { text: "← К разделам", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) },
        { text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) },
      ]],
    },
  });

  // Служебное уведомление в чат проекта: «Кто-то открыл статью»
  if (from) {
    await logServiceEvent(
      chatId,
      binding,
      from,
      `👁️ ${formatUserName(from)} открыл(а) статью «${article.title}»`,
    );
  }
}

/**
 * Пишет служебное сообщение в project_messages чата проекта.
 *
 * sender_name = реальное имя пользователя, совершившего действие (чтобы в
 * web-UI превью/уведомления не показывали обобщённого «Бот»).
 * sender_participant_id подтягиваем по telegram_user_id — тогда в UI
 * подхватится аватарка и форматирование как у обычных сообщений.
 *
 * Параметр `counted` управляет, попадёт ли событие в счётчик непрочитанных
 * сайдбара (RPC get_inbox_threads_v2 исключает source='telegram_service'):
 *   - counted=false → source='telegram_service' (видно в чате, не дёргает бейдж)
 *   - counted=true  → source='bot_event'        (дёргает бейдж)
 */
export async function logServiceEvent(
  _chatId: number,
  binding: TgChatBinding,
  from: TgUser,
  text: string,
  opts: { counted?: boolean } = {},
) {
  const participantId = await participantByTgId(binding.workspace_id, from.id);
  await service.from("project_messages").insert({
    project_id: binding.project_id,
    workspace_id: binding.workspace_id,
    sender_participant_id: participantId,
    sender_name: formatUserName(from),
    sender_role: null,
    content: text,
    source: opts.counted ? "bot_event" : "telegram_service",
    channel: binding.channel || "client",
    thread_id: binding.thread_id ?? undefined,
  });
}

export async function resolvePrefixId(
  table: "knowledge_articles" | "knowledge_groups" | "knowledge_qa" | "folder_slots",
  workspaceId: string,
  prefix: string,
): Promise<string | null> {
  // UUID имеет тип uuid в Postgres, ilike не работает напрямую — кастим через RPC-стиль фильтр.
  // Проще: фильтруем на клиенте после получения всех id workspace (их обычно не миллионы).
  // В будущем — заменить на текстовый индекс по id::text, если выборка станет большой.
  const { data } = await service
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId);
  if (!data) return null;
  const matches = data.filter((r: { id: string }) => r.id.startsWith(prefix.toLowerCase()));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    console.warn(`[resolvePrefixId] ambiguous prefix ${prefix} in ${table}`);
    return null;
  }
  return matches[0].id;
}
