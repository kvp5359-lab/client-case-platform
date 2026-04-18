/**
 * Упаковка/распаковка данных в callback_data (лимит Telegram: 64 байта).
 *
 * Формат: `<action>:<arg1>:<arg2>...`
 * UUID укорачиваются до 8 символов — резолвятся через LIKE 'prefix%' в рамках workspace.
 *
 * Экшены:
 *  m:h                          — главное меню (home)
 *  k:g:<groupId8>:<page>        — группа знаний, страница `page`
 *  k:g:_:<page>                 — корень дерева групп знаний
 *  k:a:<articleId8>             — открыть статью
 *  k:qa:<qaId8>                 — открыть Q&A
 *  k:qalist:<page>              — список всех Q&A
 *  u:s:<slotId8>                — выбрать слот
 *  u:cancel                     — отменить загрузку
 *  nav:b:<screen>               — назад (screen: kb, up, home)
 */

export type CallbackAction =
  | { kind: "menu_home" }
  | { kind: "kb_group"; groupId: string | null; page: number }
  | { kind: "kb_article"; articleId: string }
  | { kind: "kb_qa"; qaId: string }
  | { kind: "kb_qa_list"; page: number }
  | { kind: "upload_start" }
  | { kind: "upload_folder"; folderId: string }
  | { kind: "upload_slot"; slotId: string }
  | { kind: "upload_free" }
  | { kind: "upload_folder_free"; folderId: string }
  | { kind: "upload_finish" }
  | { kind: "upload_cancel" }
  | { kind: "doc_status" }
  | { kind: "folder_info" }
  | { kind: "folder_article"; folderId: string }
  | { kind: "nav_back"; screen: "kb" | "up" | "home" };

export function encode(action: CallbackAction): string {
  switch (action.kind) {
    case "menu_home":
      return "m:h";
    case "kb_group":
      return `k:g:${action.groupId ? action.groupId.slice(0, 8) : "_"}:${action.page}`;
    case "kb_article":
      return `k:a:${action.articleId.slice(0, 8)}`;
    case "kb_qa":
      return `k:qa:${action.qaId.slice(0, 8)}`;
    case "kb_qa_list":
      return `k:qalist:${action.page}`;
    case "upload_start":
      return "u:start";
    case "upload_folder":
      return `u:f:${action.folderId.slice(0, 8)}`;
    case "upload_slot":
      return `u:s:${action.slotId.slice(0, 8)}`;
    case "upload_free":
      return "u:free";
    case "upload_folder_free":
      return `u:ff:${action.folderId.slice(0, 8)}`;
    case "upload_finish":
      return "u:fin";
    case "upload_cancel":
      return "u:cancel";
    case "doc_status":
      return "d:s";
    case "folder_info":
      return "f:i";
    case "folder_article":
      return `f:a:${action.folderId.slice(0, 8)}`;
    case "nav_back":
      return `nav:b:${action.screen}`;
  }
}

export function decode(data: string): CallbackAction | null {
  const parts = data.split(":");
  switch (parts[0]) {
    case "m":
      if (parts[1] === "h") return { kind: "menu_home" };
      return null;
    case "k":
      if (parts[1] === "g") {
        const groupId = parts[2] === "_" ? null : parts[2];
        const page = parseInt(parts[3] ?? "0", 10);
        return { kind: "kb_group", groupId, page: isNaN(page) ? 0 : page };
      }
      if (parts[1] === "a") {
        return { kind: "kb_article", articleId: parts[2] };
      }
      if (parts[1] === "qa") {
        return { kind: "kb_qa", qaId: parts[2] };
      }
      if (parts[1] === "qalist") {
        const page = parseInt(parts[2] ?? "0", 10);
        return { kind: "kb_qa_list", page: isNaN(page) ? 0 : page };
      }
      return null;
    case "u":
      if (parts[1] === "start") return { kind: "upload_start" };
      if (parts[1] === "f") return { kind: "upload_folder", folderId: parts[2] };
      if (parts[1] === "s") return { kind: "upload_slot", slotId: parts[2] };
      if (parts[1] === "free") return { kind: "upload_free" };
      if (parts[1] === "ff") return { kind: "upload_folder_free", folderId: parts[2] };
      if (parts[1] === "fin") return { kind: "upload_finish" };
      if (parts[1] === "cancel") return { kind: "upload_cancel" };
      return null;
    case "d":
      if (parts[1] === "s") return { kind: "doc_status" };
      return null;
    case "f":
      if (parts[1] === "i") return { kind: "folder_info" };
      if (parts[1] === "a") return { kind: "folder_article", folderId: parts[2] };
      return null;
    case "nav":
      if (parts[1] === "b" && (parts[2] === "kb" || parts[2] === "up" || parts[2] === "home")) {
        return { kind: "nav_back", screen: parts[2] as "kb" | "up" | "home" };
      }
      return null;
  }
  return null;
}
