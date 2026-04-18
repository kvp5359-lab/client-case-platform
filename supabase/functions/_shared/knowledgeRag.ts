/**
 * Shared RAG (Retrieval-Augmented Generation) module for knowledge base.
 * Used by: knowledge-search, chat-with-messages.
 *
 * Provides: embedding, reranking, vector search, source selection, context building.
 */

import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isGeminiModel, callGeminiApi, messagesToGeminiContents } from "./gemini-client.ts";

// ── Constants ──

const VOYAGE_MODEL = "voyage-3.5";
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_RERANK_MODEL = "rerank-2.5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export const RAG_DEFAULTS = {
  INITIAL_MATCH_COUNT: 20,
  RERANKED_TOP_K: 5,
  MATCH_THRESHOLD: 0.15,
  SOURCE_SELECTION_MAX_TOKENS: 2048,
} as const;

// ── Types ──

export interface ChunkResult {
  id: string;
  article_id: string | null;
  qa_id: string | null;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

export interface SourceCandidate {
  id: string;
  title: string;
  summary: string | null;
  source_type: "article" | "qa";
}

export interface AISelectedSource {
  id: string;
  relevance: number;
}

export interface GroupedSource {
  article_id: string | null;
  qa_id: string | null;
  article_title: string;
  similarity: number;
  source_type: string;
}

export interface RagContext {
  contextText: string;
  chunks: ChunkResult[];
  sources: GroupedSource[];
}

// ── VoyageAI: Embedding ──

export async function fetchQueryEmbedding(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`VoyageAI API error (${response.status}):`, errText);
    throw new Error(`VoyageAI API error (${response.status})`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ── VoyageAI: Batch Embedding (for indexing) ──

/**
 * Fetch embeddings for multiple texts (document indexing mode).
 * Uses input_type "document" — optimized for storing, not querying.
 * VoyageAI supports up to 128 inputs per call.
 */
export async function fetchBatchEmbeddings(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`VoyageAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

// ── VoyageAI: Reranking ──

export async function rerankChunks(
  apiKey: string,
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult[]> {
  const response = await fetch(VOYAGE_RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      documents,
      model: VOYAGE_RERANK_MODEL,
      top_k: topK,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`VoyageAI Rerank error (${response.status}):`, errText);
    throw new Error(`VoyageAI Rerank error (${response.status})`);
  }

  const data = await response.json();
  return data.results as RerankResult[];
}

// ── AI Source Selection ──

const SOURCE_SELECTION_PROMPT = `Ты — система подбора источников для ответа на вопрос пользователя.
Тебе дан список статей/Q&A базы знаний с их краткими описаниями (summary).

Задача: выбери ВСЕ источники, которые могут содержать релевантную информацию для ответа на вопрос.
Лучше включить лишний источник, чем пропустить нужный.

Ответь СТРОГО в формате JSON-массива (без markdown, без пояснений):
[{"id": "uuid-статьи", "relevance": 0.85}, ...]

- relevance: от 0 до 1, насколько источник релевантен вопросу
- Включай источники с relevance >= 0.3
- Если ни один источник не подходит — верни пустой массив []`;

export async function selectSourcesWithAI(
  apiKey: string,
  aiModel: string,
  question: string,
  candidates: SourceCandidate[],
): Promise<AISelectedSource[]> {
  const candidateList = candidates
    .map((c, i) => {
      const summary = c.summary || "(summary отсутствует)";
      return `${i + 1}. [${c.source_type === "qa" ? "Q&A" : "Статья"}] ID: ${c.id}\n   Название: ${c.title}\n   Содержимое: ${summary}`;
    })
    .join("\n\n");

  const userMessage = `Вопрос пользователя: "${question}"\n\nИсточники базы знаний:\n\n${candidateList}`;
  let text = "[]";

  if (isGeminiModel(aiModel)) {
    text = await callGeminiApi({
      apiKey,
      model: aiModel,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      systemInstruction: SOURCE_SELECTION_PROMPT,
    });
  } else {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiModel,
        max_tokens: RAG_DEFAULTS.SOURCE_SELECTION_MAX_TOKENS,
        system: SOURCE_SELECTION_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`AI API error (${response.status}):`, errText);
      throw new Error(`AI API error (${response.status})`);
    }

    const data = await response.json();
    text = data.content?.[0]?.text || "[]";
  }

  const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item: unknown) =>
        item &&
        typeof item === "object" &&
        "id" in (item as Record<string, unknown>) &&
        "relevance" in (item as Record<string, unknown>),
    ) as AISelectedSource[];
    // Deduplicate by id
    const seen = new Set<string>();
    return valid.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  } catch {
    console.error("Failed to parse AI source selection response:", jsonStr);
    return [];
  }
}

// ── Resolve article IDs for a template (project-scoped) ──

export async function resolveTemplateArticleIds(
  supabaseAdmin: SupabaseClient,
  templateId: string,
): Promise<string[]> {
  const [artLinksRes, grpLinksRes] = await Promise.all([
    supabaseAdmin
      .from("knowledge_article_templates")
      .select("article_id")
      .eq("project_template_id", templateId),
    supabaseAdmin
      .from("knowledge_group_templates")
      .select("group_id")
      .eq("project_template_id", templateId),
  ]);

  const allIds = new Set(
    (artLinksRes.data || []).map((l: { article_id: string }) => l.article_id),
  );
  const grpIds = (grpLinksRes.data || []).map(
    (l: { group_id: string }) => l.group_id,
  );

  if (grpIds.length > 0) {
    const { data: grpArticles } = await supabaseAdmin
      .from("knowledge_article_groups")
      .select("article_id")
      .in("group_id", grpIds);
    for (const ga of grpArticles || []) {
      allIds.add(ga.article_id);
    }
  }

  return [...allIds];
}

// ── Filter to published article IDs ──

export async function filterPublishedArticles(
  supabaseAdmin: SupabaseClient,
  articleIds: string[],
): Promise<string[]> {
  if (articleIds.length === 0) return [];
  const { data: published } = await supabaseAdmin
    .from("knowledge_articles")
    .select("id")
    .in("id", articleIds)
    .eq("is_published", true);
  return (published || []).map((a: { id: string }) => a.id);
}

// ── Vector search ──

export async function searchChunks(
  supabaseAdmin: SupabaseClient,
  params: {
    queryEmbedding: number[];
    workspaceId: string;
    templateId?: string;
    matchThreshold?: number;
    matchCount?: number;
  },
): Promise<ChunkResult[]> {
  const {
    queryEmbedding,
    workspaceId,
    templateId,
    matchThreshold = RAG_DEFAULTS.MATCH_THRESHOLD,
    matchCount = RAG_DEFAULTS.INITIAL_MATCH_COUNT,
  } = params;

  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  if (templateId) {
    const articleIds = await resolveTemplateArticleIds(supabaseAdmin, templateId);
    const publishedIds = await filterPublishedArticles(supabaseAdmin, articleIds);

    if (publishedIds.length === 0) return [];

    const { data, error } = await supabaseAdmin.rpc(
      "match_knowledge_chunks_by_articles",
      {
        query_embedding: embeddingStr,
        article_ids: publishedIds,
        match_threshold: matchThreshold,
        match_count: matchCount,
      },
    );

    if (error) throw new Error(`Search error: ${error.message}`);
    return (data || []) as ChunkResult[];
  }

  // Workspace-wide search
  const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
    query_embedding: embeddingStr,
    match_workspace_id: workspaceId,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) throw new Error(`Search error: ${error.message}`);
  return (data || []) as ChunkResult[];
}

// ── Build enriched search query for follow-ups ──

export function buildSearchQuery(
  question: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string {
  if (
    !conversationHistory ||
    !Array.isArray(conversationHistory) ||
    conversationHistory.length === 0
  ) {
    return question;
  }

  const reversed = [...conversationHistory].reverse();
  const lastUserMsg = reversed.find((m) => m.role === "user");
  const lastAssistantMsg = reversed.find((m) => m.role === "assistant");

  const isShortFollowUp = question.length < 80;

  if (isShortFollowUp && lastAssistantMsg) {
    const assistantContext = lastAssistantMsg.content.slice(0, 500);
    const userContext = lastUserMsg ? lastUserMsg.content : "";
    return `${userContext} ${assistantContext} — ${question}`;
  }

  if (lastUserMsg) {
    return `${lastUserMsg.content} — ${question}`;
  }

  return question;
}

// ── Group chunks into sources with titles ──

export async function buildSourcesFromChunks(
  supabaseAdmin: SupabaseClient,
  chunks: ChunkResult[],
): Promise<{ sources: GroupedSource[]; articleMap: Map<string, string>; qaMap: Map<string, string> }> {
  // Get article titles
  const uniqueArticleIds = [
    ...new Set(chunks.filter((c) => c.article_id).map((c) => c.article_id!)),
  ];
  const { data: articles } =
    uniqueArticleIds.length > 0
      ? await supabaseAdmin
          .from("knowledge_articles")
          .select("id, title")
          .in("id", uniqueArticleIds)
      : { data: [] };

  const articleMap = new Map(
    (articles || []).map((a: { id: string; title: string }) => [a.id, a.title]),
  );

  // Get Q&A titles
  const uniqueQaIds = [
    ...new Set(chunks.filter((c) => c.qa_id).map((c) => c.qa_id!)),
  ];
  const { data: qaItems } =
    uniqueQaIds.length > 0
      ? await supabaseAdmin
          .from("knowledge_qa")
          .select("id, question")
          .in("id", uniqueQaIds)
      : { data: [] };

  const qaMap = new Map(
    (qaItems || []).map((q: { id: string; question: string }) => [
      q.id,
      q.question,
    ]),
  );

  // Group by article/QA
  const sourceGroupMap = new Map<string, GroupedSource>();

  for (const c of chunks) {
    const key = c.qa_id || c.article_id || c.id;
    const existing = sourceGroupMap.get(key);
    const title = c.qa_id
      ? qaMap.get(c.qa_id) || "Q&A"
      : articleMap.get(c.article_id!) || "Без названия";

    if (existing) {
      if (c.similarity > existing.similarity) {
        existing.similarity = c.similarity;
      }
    } else {
      sourceGroupMap.set(key, {
        article_id: c.article_id,
        qa_id: c.qa_id,
        article_title: title,
        similarity: c.similarity,
        source_type: c.qa_id ? "qa" : "article",
      });
    }
  }

  const sources = [...sourceGroupMap.values()].sort(
    (a, b) => b.similarity - a.similarity,
  );

  return { sources, articleMap, qaMap };
}

// ── Build context text from chunks ──

export function buildContextText(
  chunks: ChunkResult[],
  articleMap: Map<string, string>,
  qaMap: Map<string, string>,
): string {
  return chunks
    .map((c, i) => {
      if (c.qa_id) {
        const qaTitle = qaMap.get(c.qa_id) || "Q&A";
        return `[Источник ${i + 1}: Q&A "${qaTitle}"]\n${c.chunk_text}`;
      }
      const title = articleMap.get(c.article_id!) || "Без названия";
      return `[Источник ${i + 1}: "${title}"]\n${c.chunk_text}`;
    })
    .join("\n\n---\n\n");
}

// ── Parse USED_SOURCES from Claude response ──

export function parseUsedSources(
  fullText: string,
  chunks: ChunkResult[],
  sources: GroupedSource[],
): { cleanAnswer: string; filteredSources: GroupedSource[] } {
  const usedMatch = fullText.match(
    /<!-- USED_SOURCES:\s*\[([^\]]*)\]\s*-->/,
  );

  if (!usedMatch) {
    return { cleanAnswer: fullText, filteredSources: sources };
  }

  const cleanAnswer = fullText
    .replace(/<!-- USED_SOURCES:\s*\[[^\]]*\]\s*-->/g, "")
    .trim();

  const indices = usedMatch[1]
    .split(",")
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => !isNaN(n));

  if (indices.length === 0) {
    return { cleanAnswer, filteredSources: [] };
  }

  const usedKeys = new Set<string>();
  for (const idx of indices) {
    const chunk = chunks[idx - 1];
    if (chunk) {
      usedKeys.add(chunk.qa_id || chunk.article_id || chunk.id);
    }
  }

  const filteredSources = sources.filter((s) => {
    const key = s.qa_id || s.article_id || "";
    return usedKeys.has(key);
  });

  return { cleanAnswer, filteredSources };
}

// ── Full RAG pipeline: search → rerank → build context ──

export async function performRag(
  supabaseAdmin: SupabaseClient,
  params: {
    question: string;
    workspaceId: string;
    templateId?: string;
    voyageKey: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    selectedArticleIds?: string[];
    selectedQaIds?: string[];
  },
): Promise<RagContext | null> {
  const {
    question,
    workspaceId,
    templateId,
    voyageKey,
    conversationHistory,
    selectedArticleIds,
    selectedQaIds,
  } = params;

  // Build search query (enriched for follow-ups)
  const searchQuery = buildSearchQuery(question, conversationHistory);

  // Embed
  const queryEmbedding = await fetchQueryEmbedding(voyageKey, searchQuery);

  // Vector search
  let chunks = await searchChunks(supabaseAdmin, {
    queryEmbedding,
    workspaceId,
    templateId,
  });

  if (chunks.length === 0) return null;

  // Rerank
  try {
    const documents = chunks.map((c) => c.chunk_text);
    const reranked = await rerankChunks(
      voyageKey,
      searchQuery,
      documents,
      RAG_DEFAULTS.RERANKED_TOP_K,
    );
    chunks = reranked.map((r) => ({
      ...chunks[r.index],
      similarity: r.relevance_score,
    }));
  } catch (rerankError) {
    console.error("Reranker failed, cosine fallback:", rerankError);
    chunks = chunks.slice(0, RAG_DEFAULTS.RERANKED_TOP_K);
  }

  // Filter by selected sources if specified
  const hasSelectedArticles =
    selectedArticleIds && Array.isArray(selectedArticleIds) && selectedArticleIds.length > 0;
  const hasSelectedQa =
    selectedQaIds && Array.isArray(selectedQaIds) && selectedQaIds.length > 0;

  if (hasSelectedArticles || hasSelectedQa) {
    const selectedArticleSet = new Set(selectedArticleIds || []);
    const selectedQaSet = new Set(selectedQaIds || []);
    chunks = chunks.filter(
      (c) =>
        (c.article_id && selectedArticleSet.has(c.article_id)) ||
        (c.qa_id && selectedQaSet.has(c.qa_id)),
    );
    if (chunks.length === 0) return null;
  }

  // Build sources and context
  const { sources, articleMap, qaMap } = await buildSourcesFromChunks(
    supabaseAdmin,
    chunks,
  );
  const contextText = buildContextText(chunks, articleMap, qaMap);

  return { contextText, chunks, sources };
}
