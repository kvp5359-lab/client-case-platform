/**
 * Edge Function: transcribe-audio
 * Распознавание текста из аудиовложения через OpenAI Whisper API.
 *
 * POST { attachment_id: string }
 * → Скачивает файл из Storage, отправляет в Whisper, сохраняет транскрипцию.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeErrorResponse, checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Проверка авторизации
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return safeErrorResponse(req, getCorsHeaders, {
      status: 401,
      publicMessage: "Missing authorization header",
    });
  }

  try {
    console.log("[transcribe-audio] OPENAI_API_KEY set:", !!OPENAI_API_KEY);
    console.log("[transcribe-audio] authHeader:", authHeader ? "present" : "missing");

    if (!OPENAI_API_KEY) {
      console.error("[transcribe-audio] OPENAI_API_KEY is NOT set!");
      return safeErrorResponse(req, getCorsHeaders, {
        status: 500,
        publicMessage: "Распознавание речи не настроено",
        logPrefix: "OPENAI_API_KEY not configured",
      });
    }

    const body = await req.json();
    const { attachment_id } = body;
    console.log("[transcribe-audio] attachment_id:", attachment_id);

    if (!attachment_id || !isValidUUID(attachment_id)) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 400,
        publicMessage: "Invalid attachment_id",
      });
    }

    // Клиент с правами пользователя — для проверки доступа
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Проверяем, что пользователь авторизован
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 401,
        publicMessage: "Unauthorized",
      });
    }

    // Service client для операций с данными
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Получаем информацию о вложении + workspace через message
    const { data: attachment, error: attError } = await serviceClient
      .from("message_attachments")
      .select("id, storage_path, mime_type, file_name, file_id, transcription, message_id, project_messages!inner(workspace_id)")
      .eq("id", attachment_id)
      .single();

    if (attError || !attachment) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 404,
        publicMessage: "Вложение не найдено",
      });
    }

    // Z8-03: Check workspace membership
    const wsId = (attachment as any).project_messages?.workspace_id;
    if (wsId) {
      const isMember = await checkWorkspaceMembership(serviceClient, user.id, wsId);
      if (!isMember) {
        return safeErrorResponse(req, getCorsHeaders, {
          status: 403,
          publicMessage: "Нет доступа",
        });
      }
    }

    // Если транскрипция уже есть — возвращаем
    if (attachment.transcription) {
      return new Response(
        JSON.stringify({ transcription: attachment.transcription }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Проверяем, что это аудио
    const mimeType: string = attachment.mime_type || "";
    if (!mimeType.startsWith("audio/")) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 400,
        publicMessage: "Вложение не является аудиофайлом",
      });
    }

    // Скачиваем файл из Storage (определяем бакет через file_id)
    let bucket = "message-attachments";
    let storagePath = attachment.storage_path;
    if (attachment.file_id) {
      const { data: fileRecord } = await serviceClient
        .from("files")
        .select("bucket, storage_path")
        .eq("id", attachment.file_id)
        .single();
      if (fileRecord) {
        bucket = fileRecord.bucket;
        storagePath = fileRecord.storage_path;
      }
    }
    const { data: fileData, error: downloadError } = await serviceClient.storage
      .from(bucket)
      .download(storagePath);

    if (downloadError || !fileData) {
      return safeErrorResponse(req, getCorsHeaders, {
        status: 500,
        publicMessage: "Не удалось скачать аудиофайл",
        internalError: downloadError,
        logPrefix: "Storage download error",
      });
    }

    // Определяем расширение для Whisper
    const ext = attachment.file_name?.split(".").pop() || "ogg";

    // Отправляем в OpenAI Whisper API
    const formData = new FormData();
    formData.append("file", new File([fileData], `audio.${ext}`, { type: mimeType }));
    formData.append("model", "whisper-1");
    formData.append("language", "ru");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      return safeErrorResponse(req, getCorsHeaders, {
        status: 502,
        publicMessage: "Ошибка распознавания речи",
        internalError: `Whisper API ${whisperRes.status}: ${errText}`,
        logPrefix: "Whisper API error",
      });
    }

    const whisperResult = await whisperRes.json();
    const transcription: string = whisperResult.text || "";

    // Сохраняем транскрипцию в БД
    await serviceClient
      .from("message_attachments")
      .update({ transcription })
      .eq("id", attachment_id);

    return new Response(
      JSON.stringify({ transcription }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    return safeErrorResponse(req, getCorsHeaders, {
      status: 500,
      publicMessage: "Внутренняя ошибка сервера",
      internalError: error,
      logPrefix: "transcribe-audio error",
    });
  }
});
