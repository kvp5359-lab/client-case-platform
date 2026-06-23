/**
 * Загрузка документов в проект через Telegram-бота: показ списка папок и
 * слотов, состояние «жду файл» (через session.ts), сам upload в Storage +
 * documents + folder_slots, статус «заполнено / всего».
 *
 * Самая большая часть бизнес-логики бота — потому крупный модуль (~860 строк).
 */

import { service, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./shared.ts";
import { sendMessage, editMessage } from "./tg-api.ts";
import { encode as encodeCb } from "./callback-data.ts";
import { findChatBinding } from "./bindings.ts";
import { fetchTelegramFile } from "./media.ts";
import {
  collectFiles,
  formatUserName,
  escapeHtml,
  mapUploadError,
  MAX_FILE_SIZE_MB,
} from "./pure.ts";
import { getSession, setSession, clearSession } from "./session.ts";
import { resolvePrefixId, logServiceEvent } from "./knowledge.ts";
import { renderArticle } from "./tiptap.ts";
import type {
  TgInlineKeyboard,
  TgMessage,
  TgUser,
  TgChatBinding,
} from "./types.ts";

// =============================================================================
// Статус документов
// =============================================================================

export async function showDocStatus(chatId: number, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  const { data: slotsData } = await service
    .from("folder_slots")
    .select(`
      id, name, sort_order, document_id, folder_id,
      folders ( id, name, sort_order ),
      statuses ( name ),
      documents ( name )
    `)
    .eq("project_id", binding.project_id)
    .order("sort_order", { ascending: true });

  type SlotRow = {
    id: string;
    name: string;
    sort_order: number | null;
    document_id: string | null;
    folder_id: string | null;
    folders: { id: string; name: string; sort_order: number | null } | null;
    statuses: { name: string } | null;
    documents: { name: string } | null;
  };
  const slots = (slotsData ?? []) as SlotRow[];

  if (slots.length === 0) {
    const kb: TgInlineKeyboard = [[{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]];
    const text = "📊 <b>Статус документов</b>\n\n<i>В этом проекте пока нет слотов для документов.</i>";
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Группируем по папке
  type Bucket = { folderName: string; folderOrder: number; rows: SlotRow[] };
  const byFolder = new Map<string, Bucket>();
  for (const s of slots) {
    const key = s.folder_id ?? "__none__";
    if (!byFolder.has(key)) {
      byFolder.set(key, {
        folderName: s.folders?.name ?? "Без папки",
        folderOrder: s.folders?.sort_order ?? 999999,
        rows: [],
      });
    }
    byFolder.get(key)!.rows.push(s);
  }

  const folders = [...byFolder.values()].sort((a, b) => a.folderOrder - b.folderOrder);

  const lines: string[] = ["📊 <b>Статус документов</b>", ""];
  let totalFilled = 0;
  let totalEmpty = 0;
  for (const f of folders) {
    lines.push(`<b>${escapeHtml(f.folderName)}</b>`);
    for (const s of f.rows) {
      if (s.document_id) {
        totalFilled++;
        const docName = s.documents?.name ?? "документ";
        const status = s.statuses?.name;
        lines.push(
          `  ✅ ${escapeHtml(s.name)}: <i>${escapeHtml(docName)}</i>` +
            (status ? ` · <b>${escapeHtml(status)}</b>` : ""),
        );
      } else {
        totalEmpty++;
        lines.push(`  ❌ ${escapeHtml(s.name)} · <i>пусто</i>`);
      }
    }
    lines.push("");
  }
  // Документы без папки — загруженные «свободно», без привязки к слоту
  const { data: freeDocsData } = await service
    .from("documents")
    .select("id, name, created_at")
    .eq("project_id", binding.project_id)
    .is("folder_id", null)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });
  type FreeDoc = { id: string; name: string; created_at: string };
  const freeDocs = (freeDocsData ?? []) as FreeDoc[];

  if (freeDocs.length > 0) {
    lines.push("<b>БЕЗ ПАПКИ</b>");
    for (const d of freeDocs) {
      lines.push(`  📄 <i>${escapeHtml(d.name)}</i>`);
    }
    lines.push("");
  }

  lines.push(
    `Всего: заполнено <b>${totalFilled}</b>, пусто <b>${totalEmpty}</b>` +
      (freeDocs.length > 0 ? `, без папки <b>${freeDocs.length}</b>` : ""),
  );

  const text = lines.join("\n");

  const kb: TgInlineKeyboard = [
    [
      { text: "📎 Загрузить документ", callback_data: encodeCb({ kind: "upload_start" }) },
      { text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) },
    ],
  ];

  // Статус-сообщение может легко превысить 4096 символов на больших проектах.
  // В этом случае режем и шлём несколько сообщений.
  if (text.length <= 4000) {
    if (editMsgId) await editMessage(chatId, editMsgId, text, kb);
    else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // Чанкинг: правим существующее сообщение первым куском, остальное шлём.
  const chunks: string[] = [];
  let buf = "";
  for (const line of lines) {
    if ((buf + "\n" + line).length > 3800) {
      chunks.push(buf);
      buf = line;
    } else {
      buf += (buf ? "\n" : "") + line;
    }
  }
  if (buf) chunks.push(buf);

  if (editMsgId) await editMessage(chatId, editMsgId, chunks[0]);
  else await sendMessage(chatId, chunks[0]);
  for (let i = 1; i < chunks.length - 1; i++) await sendMessage(chatId, chunks[i]);
  await sendMessage(chatId, chunks[chunks.length - 1], { reply_markup: { inline_keyboard: kb } });
}

// =============================================================================
// Требования к группе (статья из knowledge_articles, привязанная к folder)
// =============================================================================

export async function showFolderArticle(chatId: number, folderPrefix: string, from?: TgUser) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  // Резолвим папку по префиксу в рамках проекта
  const { data: allFolders } = await service
    .from("folders")
    .select("id, name, knowledge_article_id")
    .eq("project_id", binding.project_id);
  const folder = (allFolders ?? []).find((f: { id: string }) => f.id.startsWith(folderPrefix.toLowerCase()));
  if (!folder || !folder.knowledge_article_id) {
    await sendMessage(chatId, "Группа не найдена или для неё нет описания.");
    return;
  }

  const { data: article } = await service
    .from("knowledge_articles")
    .select("id, title, content, is_published")
    .eq("id", folder.knowledge_article_id)
    .maybeSingle();
  if (!article || !article.is_published) {
    await sendMessage(chatId, "Описание требований недоступно.");
    return;
  }

  const chunks = renderArticle(article.title, article.content);
  for (const c of chunks) await sendMessage(chatId, c);

  await sendMessage(chatId, "Что дальше?", {
    reply_markup: {
      inline_keyboard: [
        [{
          // Переход напрямую в список слотов этой папки — тот же экран, что
          // открывается через «Загрузить документ» → выбор папки. Логика
          // загрузки полностью переиспользована через callback upload_folder.
          text: `📎 Загрузить в группу «${folder.name}»`,
          callback_data: encodeCb({ kind: "upload_folder", folderId: folder.id }),
        }],
        [{ text: "← К требованиям", callback_data: encodeCb({ kind: "folder_info" }) }],
        [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
      ],
    },
  });

  if (from) {
    await logServiceEvent(
      chatId,
      binding,
      from,
      `👁️ ${formatUserName(from)} открыл(а) требования к группе «${folder.name}»`,
    );
  }
}

// =============================================================================
// Шаги загрузки: выбор папки → выбор слота → ожидание файла
// =============================================================================

/**
 * Шаг 1 загрузки: показать список папок проекта с прогрессом «заполнено / всего».
 * Клик → showUploadFolderSlots(folderId).
 */
export async function showUploadSlots(chatId: number, from: TgUser | undefined, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding || !from) {
    await sendMessage(chatId, "Группа ещё не привязана к проекту.");
    return;
  }

  // Все слоты проекта — чтобы посчитать прогресс по папкам
  const { data: slotsData } = await service
    .from("folder_slots")
    .select("id, name, folder_id, document_id, sort_order, folders(id, name, sort_order)")
    .eq("project_id", binding.project_id)
    .order("sort_order", { ascending: true });

  type SlotRow = {
    id: string;
    name: string;
    folder_id: string | null;
    document_id: string | null;
    sort_order: number | null;
    folders: { id: string; name: string; sort_order: number | null } | null;
  };
  const slots = (slotsData ?? []) as SlotRow[];

  // Группируем по folder_id и считаем прогресс
  type Bucket = {
    folderId: string | null;
    folderName: string;
    folderOrder: number;
    filled: number;
    total: number;
  };
  const byFolder = new Map<string, Bucket>();
  for (const s of slots) {
    const key = s.folder_id ?? "__none__";
    if (!byFolder.has(key)) {
      byFolder.set(key, {
        folderId: s.folder_id,
        folderName: s.folders?.name ?? "Без папки",
        folderOrder: s.folders?.sort_order ?? 999999,
        filled: 0,
        total: 0,
      });
    }
    const b = byFolder.get(key)!;
    b.total++;
    if (s.document_id) b.filled++;
  }

  const folders = [...byFolder.values()].sort((a, b) => a.folderOrder - b.folderOrder);

  const keyboard: TgInlineKeyboard = folders
    .filter((f) => f.folderId !== null) // слоты без папки пока пропускаем
    .map((f) => {
      const remaining = f.total - f.filled;
      const statusSuffix = remaining === 0 ? " ✓" : ` (${f.filled}/${f.total})`;
      return [{
        text: `📁 ${f.folderName}${statusSuffix}`,
        callback_data: encodeCb({ kind: "upload_folder", folderId: f.folderId! }),
      }];
    });

  // Слоты без папки проекта — отдельной кнопкой, если они есть
  const noFolderBucket = byFolder.get("__none__");
  if (noFolderBucket && noFolderBucket.total > 0) {
    const remaining = noFolderBucket.total - noFolderBucket.filled;
    keyboard.push([{
      text: `📂 Прочие слоты${remaining === 0 ? " ✓" : ` (${noFolderBucket.filled}/${noFolderBucket.total})`}`,
      callback_data: encodeCb({ kind: "upload_folder", folderId: "__none__" }),
    }]);
  }

  // Загрузка без привязки к слоту (попадает в «Без папки»)
  keyboard.push([{ text: "📁 Загрузить без привязки", callback_data: encodeCb({ kind: "upload_free" }) }]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = folders.length === 0 && !noFolderBucket
    ? "<b>В этом проекте нет слотов для документов.</b>\n\nМожно загрузить документ без привязки — он попадёт в раздел «Без папки»."
    : "<b>Выберите папку</b>\n\nВ скобках — заполнено из общего числа слотов.";

  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, keyboard);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
}

/**
 * Шаг 2 загрузки: список ПУСТЫХ слотов выбранной папки.
 */
export async function showUploadFolderSlots(
  chatId: number,
  from: TgUser,
  folderPrefix: string,
  editMsgId?: number,
) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  // Спецкод "__none__" — слоты без папки
  const isNoFolder = folderPrefix === "__none__";
  let fullFolderId: string | null = null;
  let folderName = "Прочие слоты";

  // Есть ли у папки статья с требованиями (для кнопки «Прочитать требования»)
  let hasRequirementsArticle = false;

  if (!isNoFolder) {
    const { data: allFolders } = await service
      .from("folders")
      .select("id, name, knowledge_article_id")
      .eq("project_id", binding.project_id);
    const f = (allFolders ?? []).find((x: { id: string }) => x.id.startsWith(folderPrefix.toLowerCase()));
    if (!f) {
      await sendMessage(chatId, "Папка не найдена.");
      return;
    }
    fullFolderId = f.id;
    folderName = f.name;
    hasRequirementsArticle = !!f.knowledge_article_id;
  }

  let slotsQuery = service
    .from("folder_slots")
    .select("id, name, sort_order, document_id")
    .eq("project_id", binding.project_id)
    .is("document_id", null)
    .order("sort_order", { ascending: true });
  if (isNoFolder) {
    slotsQuery = slotsQuery.is("folder_id", null);
  } else {
    slotsQuery = slotsQuery.eq("folder_id", fullFolderId!);
  }

  const { data: slots } = await slotsQuery;

  const keyboard: TgInlineKeyboard = (slots ?? []).map((s: { id: string; name: string }) => [{
    text: `📎 ${s.name}`,
    callback_data: encodeCb({ kind: "upload_slot", slotId: s.id }),
  }]);
  // Загрузка в эту папку без привязки к конкретному слоту —
  // возможна только для реальных папок (не для "Прочие слоты" без folder_id).
  if (!isNoFolder && fullFolderId) {
    keyboard.push([{
      text: "📁 Загрузить в эту папку (без слота)",
      callback_data: encodeCb({ kind: "upload_folder_free", folderId: fullFolderId }),
    }]);
  }
  // Показать требования к группе (если статья настроена) — зеркальная кнопка
  // к «Загрузить в группу» с экрана требований. Callback тот же, что и из
  // «❓ Требования к документам» → выбор группы.
  if (!isNoFolder && fullFolderId && hasRequirementsArticle) {
    keyboard.push([{
      text: "❓ Прочитать требования",
      callback_data: encodeCb({ kind: "folder_article", folderId: fullFolderId }),
    }]);
  }
  keyboard.push([{ text: "← К папкам", callback_data: encodeCb({ kind: "upload_start" }) }]);
  keyboard.push([{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }]);

  const text = !slots || slots.length === 0
    ? `<b>📁 ${escapeHtml(folderName)}</b>\n\n<i>Все слоты этой папки уже заполнены.</i>`
    : `<b>📁 ${escapeHtml(folderName)}</b>\n\nВыберите слот для загрузки:`;

  if (editMsgId) await editMessage(chatId, editMsgId, text, keyboard);
  else await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });

  // Чтобы "from" считался использованным
  void from;
}

export async function onSlotSelected(chatId: number, from: TgUser, slotPrefix: string, editMsgId?: number) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;
  const slotId = await resolvePrefixId("folder_slots", binding.workspace_id, slotPrefix);
  if (!slotId) {
    await sendMessage(chatId, "Слот не найден.");
    return;
  }
  const { data: slot } = await service
    .from("folder_slots")
    .select("id, name, document_id, project_id")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || slot.project_id !== binding.project_id) {
    await sendMessage(chatId, "Слот не найден или относится к другому проекту.");
    return;
  }
  if (slot.document_id) {
    await sendMessage(chatId, "В этот слот уже загружен документ.");
    return;
  }

  await setSession(chatId, from.id, "awaiting_file", { slot_id: slot.id, slot_name: slot.name });

  const text = `✅ Выбран слот <b>${escapeHtml(slot.name)}</b>.\n\n📎 Прикрепите файл ответным сообщением (до ${MAX_FILE_SIZE_MB} МБ).`;
  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, [[
      { text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) },
    ]]);
  } else {
    await sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) }]] },
    });
  }
}

/**
 * Включает режим «многофайловой» загрузки.
 * folderPrefix = null → файлы попадают в раздел «Без папки».
 * folderPrefix = <uuid8> → файлы попадают в указанную папку (но без слота).
 */
export async function onFreeUploadSelected(
  chatId: number,
  from: TgUser,
  folderPrefix: string | null,
  editMsgId?: number,
) {
  const binding = await findChatBinding(chatId);
  if (!binding) return;

  let targetFolderId: string | null = null;
  let targetFolderName: string | null = null;
  if (folderPrefix) {
    const { data: allFolders } = await service
      .from("folders")
      .select("id, name")
      .eq("project_id", binding.project_id);
    const f = (allFolders ?? []).find((x: { id: string }) => x.id.startsWith(folderPrefix.toLowerCase()));
    if (!f) {
      await sendMessage(chatId, "Папка не найдена.");
      return;
    }
    targetFolderId = f.id;
    targetFolderName = f.name;
  }

  await setSession(chatId, from.id, "awaiting_free_file", {
    target_folder_id: targetFolderId,
    target_folder_name: targetFolderName,
  });

  const destination = targetFolderName
    ? `в папку <b>«${escapeHtml(targetFolderName)}»</b> (без привязки к слоту)`
    : "в раздел <b>«Без папки»</b>";
  const text = `✅ Режим: <b>свободная загрузка</b>.\n\n📎 Прикрепите файл ответным сообщением (до ${MAX_FILE_SIZE_MB} МБ). Документ попадёт ${destination}.`;
  const cancelRow = [[{ text: "❌ Отмена", callback_data: encodeCb({ kind: "upload_cancel" }) }]];
  if (editMsgId) {
    await editMessage(chatId, editMsgId, text, cancelRow);
  } else {
    await sendMessage(chatId, text, { reply_markup: { inline_keyboard: cancelRow } });
  }
}

// =============================================================================
// Сам upload файла
// =============================================================================

/** Общая логика: скачать файл из Telegram, создать documents+files+версию, запустить extract-text. */
async function uploadDocumentCore(
  msg: TgMessage,
  binding: TgChatBinding,
  folderId: string | null,
  botToken: string,
): Promise<{ ok: true; docId: string; fileName: string } | { ok: false; reason: string }> {
  const chatId = msg.chat.id;
  const files = collectFiles(msg);
  if (files.length === 0) return { ok: false, reason: "no_file" };
  if (files.length > 1) return { ok: false, reason: "multiple_files" };

  const f = files[0];
  const declaredSize =
    msg.document?.file_size ?? msg.video?.file_size ?? msg.audio?.file_size ?? msg.voice?.file_size ?? 0;
  if (declaredSize && declaredSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return { ok: false, reason: "too_large" };
  }

  const dl = await fetchTelegramFile(f.fileId, botToken);
  if (!dl.ok) return { ok: false, reason: "download_failed" };

  const { data: doc, error: docErr } = await service
    .from("documents")
    .insert({
      folder_id: folderId,
      project_id: binding.project_id,
      workspace_id: binding.workspace_id,
      name: f.originalName,
      status: "pending",
    })
    .select("id")
    .single();
  if (docErr || !doc) {
    console.error("create doc error:", docErr);
    return { ok: false, reason: "create_document_failed" };
  }

  const ts = Date.now();
  const storagePath = `${binding.workspace_id}/${doc.id}/v1_${ts}_${f.safeName}`;
  const { error: upErr } = await service.storage.from("files").upload(storagePath, dl.buffer, {
    contentType: f.mimeType,
    upsert: false,
  });
  if (upErr) {
    console.error("storage upload:", upErr);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "storage_upload_failed" };
  }

  const { data: fileRow, error: fileErr } = await service
    .from("files")
    .insert({
      workspace_id: binding.workspace_id,
      bucket: "files",
      storage_path: storagePath,
      file_name: f.originalName,
      file_size: dl.buffer.byteLength,
      mime_type: f.mimeType,
    })
    .select("id")
    .single();
  if (fileErr || !fileRow) {
    console.error("files insert:", fileErr);
    await service.storage.from("files").remove([storagePath]);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "file_insert_failed" };
  }

  const { error: verErr } = await service.rpc("add_document_version_service", {
    p_document_id: doc.id,
    p_file_path: storagePath,
    p_file_name: f.originalName,
    p_file_size: dl.buffer.byteLength,
    p_mime_type: f.mimeType,
    p_file_id: fileRow.id,
  });
  if (verErr) {
    console.error("add_document_version:", verErr);
    await service.storage.from("files").remove([storagePath]);
    await service.from("files").delete().eq("id", fileRow.id);
    await service.from("documents").delete().eq("id", doc.id);
    return { ok: false, reason: "version_failed" };
  }

  await service.from("documents").update({ status: "in_progress" }).eq("id", doc.id);

  // Fire-and-forget: извлечение текста, чтобы документ был виден в «Выбрать из проекта»
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internalSecret) {
    fetch(`${SUPABASE_URL}/functions/v1/extract-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ document_id: doc.id }),
    }).catch((err) => console.warn("[extract-text] fire-and-forget failed:", err));
  }

  // Мы не возвращаем chatId — он используется только для сообщений об ошибках выше.
  void chatId;
  return { ok: true, docId: doc.id, fileName: f.originalName };
}

export async function handleFreeFileUpload(msg: TgMessage, binding: TgChatBinding, botToken: string) {
  const chatId = msg.chat.id;
  const from = msg.from!;

  // Целевую папку (если есть) берём из сессии, установленной на onFreeUploadSelected
  const sessionBefore = await getSession(chatId, from.id);
  const ctxBefore = (sessionBefore?.context ?? {}) as {
    target_folder_id?: string | null;
    target_folder_name?: string | null;
  };
  const targetFolderId = ctxBefore.target_folder_id ?? null;
  const targetFolderName = ctxBefore.target_folder_name ?? null;

  const result = await uploadDocumentCore(msg, binding, targetFolderId, botToken);
  if (!result.ok) {
    if (result.reason === "no_file") {
      await clearSession(chatId, from.id);
    }
    const errText = mapUploadError(result.reason);
    await sendMessage(chatId, errText, { reply_to_message_id: msg.message_id });
    return;
  }

  const mediaGroupId = msg.media_group_id ?? null;

  const ctx = (sessionBefore?.context ?? {}) as {
    batch_msg_id?: number;
    batch_group_id?: string;
    batch_names?: string[];
    target_folder_id?: string | null;
    target_folder_name?: string | null;
  };

  const isSameBatch =
    ctx.batch_msg_id &&
    ctx.batch_group_id &&
    mediaGroupId &&
    ctx.batch_group_id === mediaGroupId;

  const names = isSameBatch ? [...(ctx.batch_names ?? []), result.fileName] : [result.fileName];

  const destinationLabel = targetFolderName
    ? `в папку «${targetFolderName}»`
    : "в «Без папки»";

  const confirmationText = names.length === 1
    ? `✅ Загружен <b>${escapeHtml(names[0])}</b> ${escapeHtml(destinationLabel)}. Можно присылать ещё файлы.`
    : `✅ Загружено файлов: <b>${names.length}</b> ${escapeHtml(destinationLabel)}:\n` +
      names.map((n) => `• ${escapeHtml(n)}`).join("\n") +
      "\n\nМожно присылать ещё.";

  const keyboard: TgInlineKeyboard = [
    [
      { text: "✅ Готово", callback_data: encodeCb({ kind: "upload_finish" }) },
      { text: "📊 Статус", callback_data: encodeCb({ kind: "doc_status" }) },
    ],
    [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
  ];

  let newBatchMsgId: number | null = null;
  if (isSameBatch && ctx.batch_msg_id) {
    await editMessage(chatId, ctx.batch_msg_id, confirmationText, keyboard);
    newBatchMsgId = ctx.batch_msg_id;
  } else {
    const sent = await sendMessage(chatId, confirmationText, {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    }) as { message_id?: number } | null;
    newBatchMsgId = sent?.message_id ?? null;
  }

  // Обновляем состояние сессии: накопление батча + сохраняем папку-назначение
  await setSession(chatId, from.id, "awaiting_free_file", {
    batch_msg_id: newBatchMsgId,
    batch_group_id: mediaGroupId,
    batch_names: names,
    target_folder_id: targetFolderId,
    target_folder_name: targetFolderName,
  });

  const logDest = targetFolderName
    ? `в папку «${targetFolderName}» (без слота)`
    : "без привязки к слоту";
  await logServiceEvent(
    chatId,
    binding,
    from,
    `📎 ${formatUserName(from)} загрузил(а) документ «${result.fileName}» ${logDest}`,
    { counted: true },
  );
}

export async function handleSlotFileUpload(msg: TgMessage, binding: TgChatBinding, slotId: string, botToken: string) {
  const chatId = msg.chat.id;
  const from = msg.from!;

  // Проверяем слот ещё раз — вдруг параллельно заполнился
  const { data: slot } = await service
    .from("folder_slots")
    .select("id, name, document_id, folder_id")
    .eq("id", slotId)
    .maybeSingle();
  if (!slot || slot.document_id) {
    await clearSession(chatId, from.id);
    await sendMessage(chatId, "Слот уже занят — отмена.", { reply_to_message_id: msg.message_id });
    return;
  }

  // Загрузка документа — общий core (тот же, что и у free-upload): collectFiles,
  // проверка размера, скачивание с ретраями, documents+files+версия+in_progress,
  // fire-and-forget extract-text. Раньше эта логика (~90 строк) дублировалась
  // здесь байт-в-байт — теперь делегируем uploadDocumentCore. Документ
  // создаётся сразу в папке слота (slot.folder_id).
  const result = await uploadDocumentCore(msg, binding, slot.folder_id, botToken);
  if (!result.ok) {
    // no_file: сессию слота НЕ чистим — ждём, что пользователь пришлёт файл.
    // Тексты ошибок — общий mapUploadError (no_file/multiple_files/too_large/
    // download_failed дословно те же; редкие backend-фейлы → общий текст,
    // как и в free-upload; детали в console.error внутри core).
    await sendMessage(chatId, mapUploadError(result.reason), { reply_to_message_id: msg.message_id });
    return;
  }

  // Слот-специфика: атомарно привязываем загруженный документ к слоту.
  const { error: fillErr } = await service.rpc("fill_slot_atomic_service", {
    p_slot_id: slot.id,
    p_document_id: result.docId,
    p_project_id: binding.project_id,
  });
  if (fillErr) {
    console.error("fill_slot_atomic:", fillErr);
    await sendMessage(chatId, `⚠️ Не удалось заполнить слот «${slot.name}» (возможно, он уже заполнен кем-то ещё).`, {
      reply_to_message_id: msg.message_id,
    });
    await clearSession(chatId, from.id);
    return;
  }

  await clearSession(chatId, from.id);
  await sendMessage(
    chatId,
    `✅ Документ <b>${escapeHtml(result.fileName)}</b> загружен в слот <b>${escapeHtml(slot.name)}</b>.`,
    {
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📎 Загрузить ещё", callback_data: encodeCb({ kind: "upload_start" }) },
            { text: "📊 Статус", callback_data: encodeCb({ kind: "doc_status" }) },
          ],
          [{ text: "🏠 Главное меню", callback_data: encodeCb({ kind: "menu_home" }) }],
        ],
      },
    },
  );

  // Служебное уведомление в чат проекта — важное, в счётчик непрочитанных
  await logServiceEvent(
    chatId,
    binding,
    from,
    `📎 ${formatUserName(from)} загрузил(а) документ «${result.fileName}» в слот «${slot.name}»`,
    { counted: true },
  );
  // extract-text запускается внутри uploadDocumentCore — отдельный вызов не нужен.
}
