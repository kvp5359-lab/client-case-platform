import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIX_SECRET = "fix-cyrillic-2026";

const cyrillicMap: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
  к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
  х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"J",
  К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",
  Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Shch",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
};

function sanitizePath(p: string): string {
  const parts = p.split("/");
  const last = parts[parts.length - 1];
  const ext = last.includes(".") ? "." + last.split(".").pop() : "";
  const base = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last;
  const transliterated = base.split("").map(c => cyrillicMap[c] ?? c).join("");
  const safe = transliterated.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_");
  parts[parts.length - 1] = safe + ext;
  return parts.join("/");
}

// Все 4 файла с кириллицей (ID из БД)
const TARGET_IDS = [
  "0ff6e94e-d255-4f91-8a54-945a78f63e40",
  "6fccd0e7-7dc1-440f-8597-2810e380c981",
  "6facf66a-9f05-456b-8472-7cb1f064451e",
  "ee370f80-4188-485d-b8a3-77995dd19172",
];

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-fix-secret") !== FIX_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: files } = await client
    .from("files")
    .select("id, bucket, storage_path, file_name")
    .in("id", TARGET_IDS);

  const results = [];

  for (const file of (files ?? [])) {
    const newPath = sanitizePath(file.storage_path);
    const newName = newPath.split("/").pop()!;

    if (newPath === file.storage_path) {
      results.push({ id: file.id, status: "skip" });
      continue;
    }

    // Попытка move
    const { error: moveError } = await client.storage
      .from(file.bucket)
      .move(file.storage_path, newPath);

    if (moveError) {
      // Если файл не найден в Storage — просто обновим запись в БД
      // (файл мог быть загружен с уже правильным именем или вообще не есть)
      results.push({ id: file.id, status: "move_error", error: moveError.message, from: file.storage_path, to: newPath });
      // Всё равно обновляем БД чтобы путь был корректным
      await client.from("files").update({ storage_path: newPath, file_name: newName }).eq("id", file.id);
      await client.from("document_files").update({ file_path: newPath }).eq("file_id", file.id);
      await client.from("message_attachments").update({ storage_path: newPath, file_name: newName }).eq("file_id", file.id);
      continue;
    }

    await client.from("files").update({ storage_path: newPath, file_name: newName }).eq("id", file.id);
    await client.from("document_files").update({ file_path: newPath }).eq("file_id", file.id);
    await client.from("message_attachments").update({ storage_path: newPath, file_name: newName }).eq("file_id", file.id);

    results.push({ id: file.id, status: "ok", from: file.storage_path, to: newPath });
  }

  return new Response(JSON.stringify({ total: files?.length ?? 0, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
