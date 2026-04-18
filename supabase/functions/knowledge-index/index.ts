import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { findInvalidUUID, findMissingField } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { fetchBatchEmbeddings } from "../_shared/knowledgeRag.ts";
import { stripHtml, chunkText } from "../_shared/textProcessing.ts";
import { replaceEmbeddings, generateSummary } from "../_shared/knowledgeIndexHelpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Parsed body saved outside try for error-handler access
  let body: Record<string, unknown> | null = null;
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse body
    body = await req.json();
    const requiredFields = body.reindex_all
      ? ["workspace_id"]
      : body.qa_id
        ? ["qa_id", "workspace_id"]
        : ["article_id", "workspace_id"];
    const missing = findMissingField(body, requiredFields);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const uuidFields = body.reindex_all
      ? ["workspace_id"]
      : body.qa_id
        ? ["qa_id", "workspace_id"]
        : ["article_id", "workspace_id"];
    const invalid = findInvalidUUID(body, uuidFields);
    if (invalid) {
      return new Response(
        JSON.stringify({ error: `Invalid UUID: ${invalid}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { article_id, workspace_id, qa_id } = body;

    // Create user client
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Проверка принадлежности к workspace (Z8-10)
    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, workspace_id);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Generate summary only mode ──
    if (body.generate_summary_only && article_id) {
      const { data: article, error: artErr } = await supabaseAdmin
        .from("knowledge_articles")
        .select("id, title, content")
        .eq("id", article_id)
        .single();

      if (artErr || !article) {
        return new Response(
          JSON.stringify({ error: "Article not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const plainText = stripHtml(article.content || "");
      if (plainText.length < 10) {
        return new Response(
          JSON.stringify({ error: "Article has no content for summary" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const summary = await generateSummary(
        supabaseAdmin, article_id as string, workspace_id as string, plainText, article.title,
      );

      return new Response(
        JSON.stringify({ success: true, summary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Single Q&A indexing mode ──
    if (qa_id) {
      await supabaseAdmin.from("knowledge_qa")
        .update({ indexing_status: "indexing", indexing_error: null })
        .eq("id", qa_id);

      const { data: qaItem, error: qaError } = await supabaseAdmin
        .from("knowledge_qa")
        .select("id, question, answer, workspace_id")
        .eq("id", qa_id)
        .single();

      if (qaError || !qaItem) {
        await supabaseAdmin.from("knowledge_qa")
          .update({ indexing_status: "error", indexing_error: "Q&A not found" })
          .eq("id", qa_id);
        return new Response(
          JSON.stringify({ error: "Q&A not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const qaText = `Вопрос: ${qaItem.question}\n\nОтвет: ${qaItem.answer}`;
      if (qaText.length < 10) {
        await supabaseAdmin.from("knowledge_embeddings").delete().eq("qa_id", qa_id);
        await supabaseAdmin.from("knowledge_qa")
          .update({ indexing_status: "indexed", indexed_at: new Date().toISOString() })
          .eq("id", qa_id);
        return new Response(
          JSON.stringify({ success: true, chunks_count: 0, message: "No content to index" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Get VoyageAI key
      const { data: voyageKeyQa } = await supabaseAdmin.rpc(
        "get_workspace_voyageai_api_key",
        { workspace_uuid: workspace_id },
      );
      if (!voyageKeyQa) {
        await supabaseAdmin.from("knowledge_qa")
          .update({ indexing_status: "error", indexing_error: "VoyageAI API key not configured" })
          .eq("id", qa_id);
        return new Response(
          JSON.stringify({ error: "VoyageAI API key not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Single embedding (no chunking)
      const embeddings = await fetchBatchEmbeddings(voyageKeyQa as string, [qaText]);

      // Atomic delete + insert via RPC
      await replaceEmbeddings(supabaseAdmin, {
        qaId: qa_id as string,
        workspaceId: workspace_id as string,
        chunks: [{ chunkIndex: 0, chunkText: qaText, embedding: JSON.stringify(embeddings[0]) }],
      });

      await supabaseAdmin.from("knowledge_qa")
        .update({ indexing_status: "indexed", indexed_at: new Date().toISOString(), indexing_error: null })
        .eq("id", qa_id);

      console.log(`Indexed Q&A ${qa_id}: 1 chunk, ${qaText.length} chars`);

      return new Response(
        JSON.stringify({ success: true, chunks_count: 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Batch reindex mode ──
    if (body.reindex_all) {
      const REINDEX_BATCH_SIZE = 10;

      // Get VoyageAI key
      const { data: voyageKey } = await supabaseAdmin.rpc(
        "get_workspace_voyageai_api_key",
        { workspace_uuid: workspace_id },
      );
      if (!voyageKey) {
        return new Response(
          JSON.stringify({ error: "VoyageAI API key not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Fetch articles needing reindex
      const { data: articles } = await supabaseAdmin
        .from("knowledge_articles")
        .select("id, title, content, workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("is_published", true)
        .in("indexing_status", ["none", "error"])
        .limit(REINDEX_BATCH_SIZE);

      let indexed = 0;
      let failed = 0;

      for (const art of (articles || [])) {
        try {
          await supabaseAdmin.from("knowledge_articles")
            .update({ indexing_status: "indexing", indexing_error: null })
            .eq("id", art.id);

          const plainText = stripHtml(art.content || "");
          if (!plainText || plainText.length < 10) {
            await supabaseAdmin.from("knowledge_embeddings").delete().eq("article_id", art.id);
            await supabaseAdmin.from("knowledge_articles")
              .update({ indexing_status: "indexed", indexed_at: new Date().toISOString() })
              .eq("id", art.id);
            indexed++;
            continue;
          }

          const chunks = chunkText(plainText);
          if (art.title && chunks.length > 0) {
            chunks[0] = `${art.title}\n\n${chunks[0]}`;
          }

          const embeddings = await fetchBatchEmbeddings(voyageKey as string, chunks);

          // Atomic delete + insert via RPC
          await replaceEmbeddings(supabaseAdmin, {
            articleId: art.id,
            workspaceId: workspace_id as string,
            chunks: chunks.map((text, i) => ({
              chunkIndex: i,
              chunkText: text,
              embedding: JSON.stringify(embeddings[i]),
            })),
          });

          await supabaseAdmin.from("knowledge_articles")
            .update({ indexing_status: "indexed", indexed_at: new Date().toISOString(), indexing_error: null })
            .eq("id", art.id);

          indexed++;
        } catch (err) {
          failed++;
          await supabaseAdmin.from("knowledge_articles")
            .update({ indexing_status: "error", indexing_error: "Ошибка индексации. Попробуйте позже." })
            .eq("id", art.id);
          console.error(`Reindex failed for ${art.id}:`, err);
        }
      }

      // ── Reindex Q&A items ──
      const { data: qas } = await supabaseAdmin
        .from("knowledge_qa")
        .select("id, question, answer, workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("is_published", true)
        .in("indexing_status", ["none", "error"])
        .limit(REINDEX_BATCH_SIZE);

      for (const qa of (qas || [])) {
        try {
          await supabaseAdmin.from("knowledge_qa")
            .update({ indexing_status: "indexing", indexing_error: null })
            .eq("id", qa.id);

          const qaText = `Вопрос: ${qa.question}\n\nОтвет: ${qa.answer}`;
          if (qaText.length < 10) {
            await supabaseAdmin.from("knowledge_embeddings").delete().eq("qa_id", qa.id);
            await supabaseAdmin.from("knowledge_qa")
              .update({ indexing_status: "indexed", indexed_at: new Date().toISOString() })
              .eq("id", qa.id);
            indexed++;
            continue;
          }

          const embeddings = await fetchBatchEmbeddings(voyageKey as string, [qaText]);
          // Atomic delete + insert via RPC
          await replaceEmbeddings(supabaseAdmin, {
            qaId: qa.id,
            workspaceId: workspace_id as string,
            chunks: [{ chunkIndex: 0, chunkText: qaText, embedding: JSON.stringify(embeddings[0]) }],
          });

          await supabaseAdmin.from("knowledge_qa")
            .update({ indexing_status: "indexed", indexed_at: new Date().toISOString(), indexing_error: null })
            .eq("id", qa.id);

          indexed++;
        } catch (err) {
          failed++;
          await supabaseAdmin.from("knowledge_qa")
            .update({ indexing_status: "error", indexing_error: "Ошибка индексации. Попробуйте позже." })
            .eq("id", qa.id);
          console.error(`Reindex Q&A failed for ${qa.id}:`, err);
        }
      }

      // Count remaining (articles + Q&A)
      const { count: remainingArticles } = await supabaseAdmin
        .from("knowledge_articles")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id)
        .eq("is_published", true)
        .in("indexing_status", ["none", "error"]);

      const { count: remainingQa } = await supabaseAdmin
        .from("knowledge_qa")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id)
        .eq("is_published", true)
        .in("indexing_status", ["none", "error"]);

      const remaining = (remainingArticles ?? 0) + (remainingQa ?? 0);
      console.log(`Reindex batch: ${indexed} indexed, ${failed} failed, ${remaining} remaining`);

      return new Response(
        JSON.stringify({ success: true, reindexed: indexed, failed, remaining }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Single article indexing mode ──

    // Set indexing status
    await supabaseAdmin
      .from("knowledge_articles")
      .update({ indexing_status: "indexing", indexing_error: null })
      .eq("id", article_id);

    // Load article
    const { data: article, error: articleError } = await supabaseAdmin
      .from("knowledge_articles")
      .select("id, title, content, workspace_id")
      .eq("id", article_id)
      .single();

    if (articleError || !article) {
      await supabaseAdmin
        .from("knowledge_articles")
        .update({ indexing_status: "error", indexing_error: "Article not found" })
        .eq("id", article_id);
      return new Response(
        JSON.stringify({ error: "Article not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Strip HTML and chunk
    const plainText = stripHtml(article.content || "");
    if (!plainText || plainText.length < 10) {
      // Article has no meaningful content — clear old embeddings
      await supabaseAdmin
        .from("knowledge_embeddings")
        .delete()
        .eq("article_id", article_id);
      await supabaseAdmin
        .from("knowledge_articles")
        .update({ indexing_status: "indexed", indexed_at: new Date().toISOString() })
        .eq("id", article_id);
      return new Response(
        JSON.stringify({ success: true, chunks_count: 0, message: "No content to index" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prepend title to first chunk for better context
    const chunks = chunkText(plainText);
    if (article.title && chunks.length > 0) {
      chunks[0] = `${article.title}\n\n${chunks[0]}`;
    }

    // Get VoyageAI key from Vault
    const { data: voyageKey, error: keyError } = await supabaseAdmin.rpc(
      "get_workspace_voyageai_api_key",
      { workspace_uuid: workspace_id },
    );

    if (keyError || !voyageKey) {
      await supabaseAdmin
        .from("knowledge_articles")
        .update({ indexing_status: "error", indexing_error: "VoyageAI API key not configured" })
        .eq("id", article_id);
      return new Response(
        JSON.stringify({ error: "VoyageAI API key not configured for this workspace" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Batch embeddings (VoyageAI supports up to 128 inputs)
    const embeddings = await fetchBatchEmbeddings(voyageKey as string, chunks);

    // Atomic delete + insert via RPC
    await replaceEmbeddings(supabaseAdmin, {
      articleId: article_id as string,
      workspaceId: workspace_id as string,
      chunks: chunks.map((text, i) => ({
        chunkIndex: i,
        chunkText: text,
        embedding: JSON.stringify(embeddings[i]),
      })),
    });

    // Update status
    await supabaseAdmin
      .from("knowledge_articles")
      .update({
        indexing_status: "indexed",
        indexed_at: new Date().toISOString(),
        indexing_error: null,
      })
      .eq("id", article_id);

    console.log(
      `Indexed article ${article_id}: ${chunks.length} chunks, ${plainText.length} chars`,
    );

    // Generate AI summary (non-blocking — don't fail indexing if summary fails)
    let summaryGenerated = false;
    try {
      await generateSummary(
        supabaseAdmin, article_id as string, workspace_id as string, plainText, article.title,
      );
      summaryGenerated = true;
    } catch (summaryErr) {
      console.error(`Summary generation failed for ${article_id}:`, summaryErr);
    }

    return new Response(
      JSON.stringify({ success: true, chunks_count: chunks.length, summary_generated: summaryGenerated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("knowledge-index error:", err);

    // Try to update status on error (body was parsed before try-block)
    try {
      const genericErr = "Ошибка индексации. Попробуйте позже.";
      if (body?.article_id) {
        await supabaseAdmin.from("knowledge_articles")
          .update({ indexing_status: "error", indexing_error: genericErr })
          .eq("id", body.article_id);
      } else if (body?.qa_id) {
        await supabaseAdmin.from("knowledge_qa")
          .update({ indexing_status: "error", indexing_error: genericErr })
          .eq("id", body.qa_id);
      }
    } catch {
      // ignore cleanup errors
    }

    return new Response(
      JSON.stringify({ error: "Knowledge indexing failed" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
