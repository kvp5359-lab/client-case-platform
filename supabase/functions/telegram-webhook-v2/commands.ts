/**
 * Обработчики slash-команд (/start, /menu, /knowledge, /upload, /status,
 * /requirements, /link, /unlink, /help) + главное меню и список требований.
 */

import { service, BOT_VERSION, getBotToken } from "./shared.ts";
import { sendMessage, editMessage, tgCall } from "./tg-api.ts";
import { findChatBinding } from "./bindings.ts";
import { helpText, menuReplyKeyboard, mainMenuInlineKeyboard } from "./pure.ts";
import { encode as encodeCb } from "./callback-data.ts";
import { showKbGroups } from "./knowledge.ts";
import { showUploadSlots, showDocStatus } from "./upload-slot.ts";
import { escapeHtmlEntities } from "../_shared/htmlFormatting.ts";
import { determineIntegrationIdForLink } from "../_shared/telegramBotToken.ts";
import type { IntegrationContext, TgInlineKeyboard, TgMessage, TgUser } from "./types.ts";

const MAIN_MENU_TEXT = "<b>Главное меню</b>\n\nВыберите раздел:";

export async function handleCommand(msg: TgMessage, text: string, ctx: IntegrationContext) {
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  // Убираем @botname из команды (/menu@bot → /menu)
  const cleaned = text.replace(/@\w+/, "");
  const [cmd, ...args] = cleaned.split(/\s+/);

  // employee-bot обслуживает только админ-привязку группы (/link, /unlink) и
  // личный deep-link (/start <token>, /help). Меню, knowledge, upload — это
  // фичи секретаря, employee их не показывает.
  if (ctx.mode === "employee") {
    switch (cmd) {
      case "/start":
        if (isPrivate) await cmdStartPrivate(chatId, args[0], msg.from);
        else await sendMessage(chatId, helpText());
        return;
      case "/help":
        await sendMessage(chatId, helpText());
        return;
      case "/link":
        await cmdLink(chatId, args[0], msg, ctx);
        return;
      case "/unlink":
        await cmdUnlink(chatId);
        return;
      default:
        // Неизвестная или workspace-only команда — молчим
        return;
    }
  }

  switch (cmd) {
    case "/start":
      if (isPrivate) await cmdStartPrivate(chatId, args[0], msg.from);
      else await sendMessage(chatId, helpText());
      return;
    case "/help":
      await sendMessage(chatId, helpText());
      return;
    case "/link":
      await cmdLink(chatId, args[0], msg, ctx);
      return;
    case "/unlink":
      await cmdUnlink(chatId);
      return;
    case "/menu":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showMainMenu(chatId);
      return;
    case "/knowledge":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showKbGroups(chatId, null, 0);
      return;
    case "/upload":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showUploadSlots(chatId, msg.from);
      return;
    case "/status":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showDocStatus(chatId);
      return;
    case "/requirements":
      if (isPrivate) {
        await sendMessage(chatId, "Эта команда работает в группе проекта.");
        return;
      }
      await showFolderInfo(chatId);
      return;
    default:
      // Неизвестная команда — молчим
      return;
  }
}

/** Deep-link привязка participant из личного чата с ботом. */
async function cmdStartPrivate(chatId: number, tokenArg: string | undefined, from: TgUser | undefined) {
  if (!tokenArg || !from) {
    await sendMessage(chatId, [
      "Привет! Я бот для работы с вашим проектом в ClientCase.",
      "",
      "Этот чат — только для технической привязки аккаунта. Основное общение идёт в групповом чате проекта.",
      "",
      "Если вы хотите привязать свой Telegram к аккаунту ClientCase — зайдите в профиль на сайте и нажмите «Привязать Telegram».",
    ].join("\n"));
    return;
  }

  // Валидность UUID (простая проверка)
  if (!/^[0-9a-f-]{36}$/i.test(tokenArg)) {
    await sendMessage(chatId, "Неверный формат токена привязки.");
    return;
  }

  const { data: tok } = await service
    .from("telegram_link_tokens")
    .select("token, participant_id, workspace_id, expires_at, consumed_at")
    .eq("token", tokenArg)
    .maybeSingle();

  if (!tok) {
    await sendMessage(chatId, "Токен не найден. Сгенерируйте новый на сайте.");
    return;
  }
  if (tok.consumed_at) {
    await sendMessage(chatId, "Этот токен уже использован. Сгенерируйте новый на сайте.");
    return;
  }
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    await sendMessage(chatId, "Срок действия токена истёк. Сгенерируйте новый на сайте.");
    return;
  }

  // Не конфликтует ли Telegram-аккаунт уже с другим participant?
  const { data: conflict } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", tok.workspace_id)
    .eq("telegram_user_id", from.id)
    .eq("is_deleted", false)
    .neq("id", tok.participant_id)
    .maybeSingle();

  if (conflict) {
    await sendMessage(chatId, "Этот Telegram-аккаунт уже привязан к другому участнику. Обратитесь к администратору.");
    return;
  }

  // Привязываем
  const { error: updErr } = await service
    .from("participants")
    .update({ telegram_user_id: from.id })
    .eq("id", tok.participant_id);

  if (updErr) {
    console.error("link participant error:", updErr);
    await sendMessage(chatId, "Не удалось привязать — попробуйте ещё раз.");
    return;
  }

  await service
    .from("telegram_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", tokenArg);

  await sendMessage(chatId, "✅ Ваш Telegram привязан к аккаунту. Теперь в группах проектов бот узнаёт вас.");
}

async function cmdLink(chatId: number, codeArg: string | undefined, msg: TgMessage, ctx: IntegrationContext) {
  if (!codeArg) {
    await sendMessage(chatId, "Укажите код: /link КОД");
    return;
  }
  const code = codeArg.trim().toUpperCase();

  const { data: thread } = await service
    .from("project_threads")
    .select("id, project_id, workspace_id, name, legacy_channel")
    .eq("link_code", code)
    .maybeSingle();

  if (!thread) {
    await sendMessage(chatId, "Чат с таким кодом не найден.");
    return;
  }

  // Существует ли уже привязка этого треда?
  const { data: existing } = await service
    .from("project_telegram_chats")
    .select("id, integration_id")
    .eq("thread_id", thread.id)
    .maybeSingle();

  // Определяем integration_id секретаря (см. determineIntegrationIdForLink):
  //  - если /link обработал сам секретарь → его id
  //  - если личный бот, но секретарь тоже в группе → id секретаря (через TG getChat)
  //  - если секретаря нет в группе → null (UI покажет баннер)
  // При UPDATE не перезаписываем непустой integration_id на null — это сохраняет
  // ранее установленную привязку, если /link шлют повторно из группы, куда
  // секретарь временно перестал отвечать.
  let resolvedIntegrationId: string | null = null;
  try {
    resolvedIntegrationId = await determineIntegrationIdForLink(
      service,
      chatId,
      thread.workspace_id,
      getBotToken(),
    );
  } catch (e) {
    console.warn("[/link] determineIntegrationIdForLink failed:", e);
  }

  const payload: Record<string, unknown> = {
    project_id: thread.project_id,
    workspace_id: thread.workspace_id,
    telegram_chat_id: chatId,
    telegram_chat_title: msg.chat.title ?? null,
    channel: thread.legacy_channel ?? "client",
    thread_id: thread.id,
    is_active: true,
    bot_version: BOT_VERSION,
  };
  if (resolvedIntegrationId) {
    payload.integration_id = resolvedIntegrationId;
  } else if (!existing) {
    // INSERT — явно проставим null (если не нашли) чтобы поле было определено.
    payload.integration_id = null;
  }
  // existing && !resolvedIntegrationId → integration_id не трогаем (см. коммент выше).

  const { error: linkError } = existing
    ? await service.from("project_telegram_chats").update(payload).eq("id", existing.id)
    : await service.from("project_telegram_chats").insert(payload);

  if (linkError?.code === '23505') {
    // Multi-bot race: другой бот успел INSERT'нуть первым, binding создан —
    // молчим, не дублируем «привязано» и не пугаем юзера 23505.
    return;
  }

  if (linkError) {
    console.error("[/link] insert/update failed:", linkError);
    await sendMessage(
      chatId,
      `⚠️ Не удалось привязать группу к «${thread.name}».\nПричина: <code>${escapeHtmlEntities(linkError.message ?? "unknown error")}</code>`,
    );
    return;
  }

  // Приветствие с постоянной кнопкой «📋 Меню» — ТОЛЬКО для секретаря.
  // У employee-бота нет своего меню (showMainMenu/inline-кнопки не показываются
  // в employee mode — см. ctx.mode проверки в sync.ts и callbacks.ts), поэтому
  // навешивать reply-клавиатуру было бы странно: юзер тапает «Меню», а бот
  // молча игнорирует. Симметрично с тем, что cmdUnlink/showMainMenu тоже
  // workspace-only по факту.
  if (ctx.mode === "workspace") {
    await sendMessage(
      chatId,
      `✅ Группа привязана к чату «${thread.name}».\n\nВнизу теперь есть кнопка <b>📋 Меню</b> — нажмите её в любой момент, чтобы открыть разделы бота.`,
      { reply_markup: menuReplyKeyboard() },
    );
  } else {
    await sendMessage(chatId, `✅ Группа привязана к чату «${thread.name}».`);
  }

  // Напомним про права админа (реакции требуют administrator)
  const me = await tgCall<{ status: string }>("getChatMember", {
    chat_id: chatId,
    user_id: parseInt(getBotToken().split(":")[0], 10),
  });
  if (me && me.status !== "administrator" && me.status !== "creator") {
    await sendMessage(chatId, "⚠️ Для синхронизации реакций сделайте бота администратором группы.");
  }
}

async function cmdUnlink(chatId: number) {
  const { data: row } = await service
    .from("project_telegram_chats")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .eq("bot_version", BOT_VERSION)
    .maybeSingle();
  if (!row) {
    await sendMessage(chatId, "Эта группа не привязана.");
    return;
  }
  await service.from("project_telegram_chats").update({ is_active: false }).eq("id", row.id);
  await sendMessage(chatId, "Группа отвязана.");
}

export async function showMainMenu(chatId: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту. Используйте /link КОД.");
    return;
  }
  await sendMessage(chatId, MAIN_MENU_TEXT, {
    reply_markup: { inline_keyboard: mainMenuInlineKeyboard() },
  });
}

export async function showFolderInfo(chatId: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  const { data: foldersData } = await service
    .from("folders")
    .select("id, name, sort_order, knowledge_article_id")
    .eq("project_id", binding.project_id)
    .not("knowledge_article_id", "is", null)
    .order("sort_order", { ascending: true });

  type FolderRow = { id: string; name: string; sort_order: number | null; knowledge_article_id: string };
  const folders = (foldersData ?? []) as FolderRow[];

  if (folders.length === 0) {
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    const text = "❓ <b>Требования к документам</b>\n\n<i>Для этого проекта пока не заведены описания групп документов.</i>";
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  const keyboard: TgInlineKeyboard = folders.map((f) => [
    { text: `📁 ${f.name}`, callback_data: encodeCb({ kind: "folder_article", folderId: f.id }) },
  ]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = "❓ <b>Требования к документам</b>\n\nВыберите группу, чтобы посмотреть, что именно нужно:";
  if (editMsgId) await editMessage(chatId, editMsgId, text, keyboard);
  else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}
