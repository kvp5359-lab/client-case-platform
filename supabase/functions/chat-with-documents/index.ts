import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findInvalidUUID, isValidUUID } from "../_shared/validation.ts";
import {
  setupAiChat,
  callClaudeApi,
  blobToBase64,
  type ChatMessage,
} from "../_shared/ai-chat-setup.ts";

interface ChatWithDocumentsRequest {
  document_ids?: string[];  // optional
  question: string;
  workspace_id: string;
  conversation_history?: ChatMessage[];
}

interface DocumentData {
  id: string;
  name: string;
  text_content: string | null;
}

interface DocumentFileData {
  file_path: string;
  file_name: string;
  mime_type: string;
  file_id: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(req)
    });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const bodyText = await req.text();
    const parsed = safeJsonParse<ChatWithDocumentsRequest>(bodyText);
    if (parsed === null) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }
    const { document_ids, question, workspace_id, conversation_history } = parsed;

    // document_ids is optional - can chat without documents
    if (document_ids !== undefined && (!Array.isArray(document_ids))) {
      return new Response(
        JSON.stringify({ error: "document_ids must be an array" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Input length limit
    if (question.length > 10000) {
      return new Response(
        JSON.stringify({ error: "Question is too long. Maximum 10000 characters allowed." }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const invalidUUID = findInvalidUUID({ workspace_id }, ["workspace_id"]);
    if (invalidUUID) {
      return new Response(
        JSON.stringify({ error: `Invalid UUID format for field: ${invalidUUID}` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate document_ids UUIDs
    if (document_ids && document_ids.length > 0) {
      const invalidDocId = document_ids.find((id: string) => !isValidUUID(id));
      if (invalidDocId) {
        return new Response(
          JSON.stringify({ error: "Invalid UUID format in document_ids" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
    }

    // Limit conversation history to prevent abuse
    const MAX_HISTORY_MESSAGES = 50;
    if (conversation_history && conversation_history.length > MAX_HISTORY_MESSAGES) {
      return new Response(
        JSON.stringify({ error: `conversation_history exceeds maximum of ${MAX_HISTORY_MESSAGES} messages` }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Auth, workspace membership, AI model & API key — shared setup
    const setup = await setupAiChat(req, authHeader, workspace_id);
    if (setup instanceof Response) return setup;

    const { supabaseUser: supabase, aiModel, apiKey } = setup;

    // Get documents with text_content (if document_ids provided)
    let documentsWithContent: DocumentData[] = [];
    let documentsText = "";
    let documentFiles: Array<{ id: string; name: string; file: Blob; mimeType: string }> = [];

    const MAX_DOCUMENTS = 30;
    if (document_ids && document_ids.length > 0) {
      const limitedIds = document_ids.slice(0, MAX_DOCUMENTS);
      if (document_ids.length > MAX_DOCUMENTS) {
        console.warn(`[CHAT] document_ids truncated: ${document_ids.length} → ${MAX_DOCUMENTS}`);
      }
      const { data: documents, error: docsError } = await supabase
        .from("documents")
        .select("id, name, text_content")
        .in("id", limitedIds)
        .returns<DocumentData[]>();

      if (docsError || !documents || documents.length === 0) {
        return new Response(
          JSON.stringify({ error: "Documents not found" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      // Separate documents with text_content and those without
      documentsWithContent = documents.filter(doc => doc.text_content && doc.text_content.trim().length > 0);
      const documentsWithoutContent = documents.filter(doc => !doc.text_content || doc.text_content.trim().length === 0);

      // For documents without text_content, try to load their files
      if (documentsWithoutContent.length > 0) {
        console.log(`[CHAT] Found ${documentsWithoutContent.length} documents without text_content, attempting to load files...`);

        const docIds = documentsWithoutContent.map(d => d.id);

        // Batch: get all document_files at once instead of N queries
        const { data: allFileInfos } = await supabase
          .from("document_files")
          .select("document_id, file_path, file_name, mime_type, file_id")
          .in("document_id", docIds)
          .eq("is_current", true)
          .returns<(DocumentFileData & { document_id: string })[]>();

        // Batch: get all file records at once for file_id lookups
        const fileIds = (allFileInfos || []).filter(f => f.file_id).map(f => f.file_id!);
        const fileRecordsMap = new Map<string, { bucket: string; storage_path: string }>();
        if (fileIds.length > 0) {
          const { data: fileRecords } = await supabase
            .from("files")
            .select("id, bucket, storage_path")
            .in("id", fileIds);
          for (const fr of fileRecords || []) {
            if (fr.bucket && fr.storage_path) {
              fileRecordsMap.set(fr.id, { bucket: fr.bucket, storage_path: fr.storage_path });
            }
          }
        }

        // Now download files (storage downloads can't be batched)
        for (const doc of documentsWithoutContent) {
          try {
            const fileInfo = (allFileInfos || []).find(f => f.document_id === doc.id);
            if (!fileInfo) {
              console.warn(`[CHAT] No file found for document ${doc.id}`);
              continue;
            }

            const isPdf = fileInfo.mime_type === "application/pdf";
            const isImage = fileInfo.mime_type.startsWith("image/");
            if (!isPdf && !isImage) {
              console.warn(`[CHAT] Unsupported file type ${fileInfo.mime_type} for document ${doc.id}`);
              continue;
            }

            let storageBucket = "document-files";
            let storagePath = fileInfo.file_path;

            if (fileInfo.file_id) {
              const fr = fileRecordsMap.get(fileInfo.file_id);
              if (fr) {
                storageBucket = fr.bucket;
                storagePath = fr.storage_path;
              }
            }

            const { data: fileData, error: downloadError } = await supabase.storage
              .from(storageBucket)
              .download(storagePath);

            if (downloadError || !fileData) {
              console.warn(`[CHAT] Failed to download file for document ${doc.id}:`, downloadError);
              continue;
            }

            console.log(`[CHAT] Successfully loaded file for document ${doc.name} (${fileInfo.mime_type})`);
            documentFiles.push({
              id: doc.id,
              name: doc.name,
              file: fileData,
              mimeType: fileInfo.mime_type,
            });
          } catch (err) {
            console.error(`[CHAT] Error loading file for document ${doc.id}:`, err);
            continue;
          }
        }
      }

      // If we have neither text content nor files, return error
      if (documentsWithContent.length === 0 && documentFiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "None of the selected documents have extracted text content or supported files. Please check the documents first or select documents with PDF/image files." }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      // Build prompt with document text contents
      if (documentsWithContent.length > 0) {
        documentsText = documentsWithContent
          .map((doc, index) => {
            return `## Документ ${index + 1}: ${doc.name}\n\n${doc.text_content}`;
          })
          .join("\n\n---\n\n");
      }
    }

    // Build system message with or without document context
    const today = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
    const hasDocuments = documentsText.length > 0 || documentFiles.length > 0;
    const systemMessage = hasDocuments
      ? `Ты помощник для анализа документов. Сегодняшняя дата: ${today}. ${documentsText ? `У тебя есть доступ к следующим документам:\n\n${documentsText}\n\n---\n\n` : ''}${documentFiles.length > 0 ? `Также у тебя есть файлы документов для анализа.\n\n` : ''}Используй информацию из этих документов для ответов на вопросы пользователя. Если информации недостаточно, укажи это. Отвечай на русском языке, используй Markdown для форматирования (заголовки, списки, таблицы, выделение текста).`
      : `Ты полезный AI-ассистент. Сегодняшняя дата: ${today}. Отвечай на вопросы пользователя на русском языке, используй Markdown для форматирования (заголовки, списки, таблицы, выделение текста). Будь вежлив и помогай пользователю.`;

    // Build messages array with conversation history and files
    type ContentBlock = { type: string; text?: string; source?: { type: string; media_type: string; data: string } };
    type MessageContent = string | ContentBlock[];
    const messages: Array<{ role: "user" | "assistant"; content: MessageContent }> = [];

    // Convert files to base64 if we have any
    const fileContents: ContentBlock[] = [];
    if (documentFiles.length > 0) {
      for (const docFile of documentFiles) {
        const base64 = await blobToBase64(docFile.file);
        const isPdf = docFile.mimeType === "application/pdf";
        fileContents.push({
          type: isPdf ? "document" : "image",
          source: {
            type: "base64",
            media_type: docFile.mimeType,
            data: base64,
          },
        });
      }
    }

    // System prompt is passed via `system` parameter
    if (!conversation_history || conversation_history.length === 0) {
      const content: ContentBlock[] = [];

      if (fileContents.length > 0) {
        content.push(...fileContents);
      }

      content.push({
        type: "text",
        text: question,
      });

      messages.push({
        role: "user",
        content: content.length > 1 ? content : question,
      });
    } else {
      // First user message with files (if any)
      if (fileContents.length > 0) {
        const firstContent: ContentBlock[] = [...fileContents];
        firstContent.push({
          type: "text",
          text: conversation_history[0]?.content || question,
        });
        messages.push({
          role: "user",
          content: firstContent,
        });
      } else if (conversation_history.length > 0) {
        messages.push({
          role: "user",
          content: conversation_history[0].content,
        });
      }

      // Add remaining conversation history (skip first, already added; skip last, will add current question)
      const historyToAdd = conversation_history.slice(1, -1);
      for (const msg of historyToAdd) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }

      // Add current question
      messages.push({
        role: "user",
        content: question,
      });
    }

    // Call Claude API via shared helper
    const result = await callClaudeApi(req, {
      apiKey: apiKey,
      model: aiModel,
      messages,
      systemPrompt: systemMessage,
    });
    if (result instanceof Response) return result;

    return new Response(
      JSON.stringify({
        success: true,
        answer: result.answer,
        documents_processed: documentsWithContent.length + documentFiles.length,
        total_documents: document_ids?.length || 0,
        used_files: documentFiles.length > 0,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
