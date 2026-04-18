/**
 * Helper functions for knowledge-index Edge Function.
 * Used by: knowledge-index.
 *
 * Provides: replaceEmbeddings (atomic upsert), generateSummary (Claude AI).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUMMARY_MAX_CHARS = 4000;

const DEFAULT_SUMMARY_PROMPT = `Перечисли кратко все темы и сущности, которые содержатся в этой статье. Не пересказывай, а укажи что внутри: какие документы, процессы, суммы, сроки, типы ВНЖ и т.д. Формат — одно предложение-заголовок и список тем через запятую. Максимум 100 слов. Отвечай на русском языке.`;

/** Atomically replace embeddings via RPC (delete old + insert new in one transaction) */
export async function replaceEmbeddings(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    articleId?: string;
    qaId?: string;
    workspaceId: string;
    chunks: { chunkIndex: number; chunkText: string; embedding: string }[];
  },
) {
  const { error } = await supabaseAdmin.rpc("upsert_knowledge_embeddings", {
    p_article_id: params.articleId ?? null,
    p_qa_id: params.qaId ?? null,
    p_workspace_id: params.workspaceId,
    p_embeddings: params.chunks.map((c) => ({
      chunk_index: c.chunkIndex,
      chunk_text: c.chunkText,
      embedding: c.embedding,
    })),
  });
  if (error) {
    throw new Error(`Failed to upsert embeddings: ${error.message}`);
  }
}

/** Generate AI summary for an article using Claude */
export async function generateSummary(
  supabaseAdmin: ReturnType<typeof createClient>,
  articleId: string,
  workspaceId: string,
  plainText: string,
  title: string,
): Promise<string | null> {
  // Get workspace settings (prompt + model + API key)
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("knowledge_summary_prompt, ai_model")
    .eq("id", workspaceId)
    .single();

  const prompt = ws?.knowledge_summary_prompt || DEFAULT_SUMMARY_PROMPT;
  const aiModel = ws?.ai_model || "claude-haiku-4-5-20251001";

  // Get Anthropic API key from Vault
  const { data: apiKey } = await supabaseAdmin.rpc(
    "get_workspace_api_key",
    { workspace_uuid: workspaceId },
  );

  if (!apiKey) {
    console.warn(`No Anthropic API key for workspace ${workspaceId}, skipping summary`);
    return null;
  }

  const truncatedText = plainText.slice(0, SUMMARY_MAX_CHARS);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: aiModel,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `${prompt}\n\nЗаголовок статьи: ${title}\n\nТекст статьи:\n${truncatedText}`,
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const summary = data.content?.[0]?.text || "";

  // Save summary to article
  await supabaseAdmin
    .from("knowledge_articles")
    .update({ summary })
    .eq("id", articleId);

  console.log(`Generated summary for article ${articleId}: ${summary.length} chars`);
  return summary;
}
