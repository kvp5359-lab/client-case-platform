import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { findInvalidUUID } from "../_shared/validation.ts";
import { resolveFileLocation, uploadFile } from "../_shared/storageHelpers.ts";
import { compressPdf, type CompressionQuality } from "../_shared/ilovepdfService.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Service client for bypassing RLS
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { documentId, quality = 'recommended' } = await req.json();

    // Валидация quality (Z8-08)
    const ALLOWED_QUALITY = ['low', 'recommended', 'extreme'];
    if (!ALLOWED_QUALITY.includes(quality)) {
      return new Response(JSON.stringify({ error: `Invalid quality. Allowed: ${ALLOWED_QUALITY.join(', ')}` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'Document ID is required' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const invalidField = findInvalidUUID({ documentId }, ["documentId"]);
    if (invalidField) {
      return new Response(JSON.stringify({ error: 'documentId must be a valid UUID' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing document:', documentId);

    // Get document details
    const { data: document, error: docError } = await supabaseClient
      .from('documents')
      .select('*, document_files!inner(*)')
      .eq('id', documentId)
      .eq('document_files.is_current', true)
      .single();

    if (docError || !document) {
      console.error('Document not found:', docError);
      return new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Проверка принадлежности к workspace (Z8-11)
    const isMember = await checkWorkspaceMembership(supabaseService, user.id, document.workspace_id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Get current file
    const currentFile = Array.isArray(document.document_files) 
      ? document.document_files[0] 
      : document.document_files;

    if (!currentFile) {
      return new Response(JSON.stringify({ error: 'Document file not found' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Check if file is already compressed
    if (currentFile.is_compressed) {
      return new Response(JSON.stringify({ error: 'File is already compressed' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Check if file is PDF
    if (currentFile.mime_type !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'Only PDF files can be compressed' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log('Downloading file from storage:', currentFile.file_path);

    // Resolve actual bucket/path via files table
    const { bucket: sourceBucket, storagePath: sourceStoragePath } = await resolveFileLocation(
      supabaseService, currentFile.file_path, currentFile.file_id,
    );
    if (currentFile.file_id) {
      console.log('Using files table: bucket =', sourceBucket, ', path =', sourceStoragePath);
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseService
      .storage
      .from(sourceBucket)
      .download(sourceStoragePath);

    if (downloadError || !fileData) {
      console.error('Failed to download from storage:', downloadError);
      return new Response(JSON.stringify({ error: 'Failed to download file from storage' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const fileBuffer = await fileData.arrayBuffer();
    const originalSize = fileBuffer.byteLength;
    console.log('Downloaded file size:', originalSize);

    // iLovePDF compression
    const publicKey = Deno.env.get('ILOVEPDF_PUBLIC_KEY');

    if (!publicKey) {
      return new Response(JSON.stringify({ error: 'iLovePDF API key not configured' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    let compressedBuffer: ArrayBuffer;
    let compressedSize: number;
    try {
      const result = await compressPdf(publicKey, fileBuffer, currentFile.file_name, quality as CompressionQuality);
      compressedBuffer = result.compressedBuffer;
      compressedSize = result.compressedSize;
      console.log('Compression complete. Original:', originalSize, 'Compressed:', compressedSize);
    } catch (compressErr) {
      console.error('iLovePDF compression failed:', compressErr);
      const errMsg = compressErr instanceof Error ? compressErr.message : 'Compression failed';
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Calculate savings
    const savingsPercent = Math.round((1 - compressedSize / originalSize) * 100);

    // Step 5: Upload compressed file to Storage
    const fileExt = currentFile.file_name.split('.').pop()?.toLowerCase() || 'pdf';
    const timestamp = Date.now();
    const newVersion = currentFile.version + 1;
    const filePath = `${document.workspace_id}/${documentId}/v${newVersion}_${timestamp}.${fileExt}`;

    // Upload compressed file to bucket 'files'
    console.log('Uploading compressed file to storage:', filePath);
    try {
      await uploadFile(supabaseService, 'files', filePath, compressedBuffer, 'application/pdf');
    } catch (uploadErr) {
      console.error('Failed to upload to storage:', uploadErr);
      return new Response(JSON.stringify({ error: 'Failed to upload compressed file to storage' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Create record in files table
    const { data: newFileRecord, error: fileRecordError } = await supabaseService
      .from('files')
      .insert({
        workspace_id: document.workspace_id,
        bucket: 'files',
        storage_path: filePath,
        file_name: currentFile.file_name,
        file_size: compressedSize,
        mime_type: 'application/pdf',
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (fileRecordError || !newFileRecord) {
      console.error('Failed to create files record:', fileRecordError);
      // Clean up uploaded file from Storage
      await supabaseService.storage.from('files').remove([filePath]);
      return new Response(JSON.stringify({ error: 'Failed to create file record' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Step 6: Atomic version creation via RPC (B-63)
    // Single transaction: mark old versions as not current + insert new version
    console.log('Creating new version record (atomic RPC)...');

    const { data: newVersionData, error: versionError } = await supabaseService
      .rpc('create_document_version_atomic', {
        p_document_id: documentId,
        p_workspace_id: document.workspace_id,
        p_version: newVersion,
        p_file_path: filePath,
        p_file_name: currentFile.file_name,
        p_file_size: compressedSize,
        p_mime_type: 'application/pdf',
        p_uploaded_by: user.id,
        p_file_id: newFileRecord.id,
        p_is_compressed: true,
      });

    if (versionError || !newVersionData) {
      console.error('Failed to create version record:', versionError);
      // Clean up uploaded file and files record
      await supabaseService.storage.from('files').remove([filePath]);
      await supabaseService.from('files').delete().eq('id', newFileRecord.id);
      return new Response(JSON.stringify({ error: 'Failed to create version record' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log('Compression complete! Version created:', newVersionData.id);

    return new Response(
      JSON.stringify({
        success: true,
        originalSize: originalSize,
        compressedSize: compressedSize,
        savings: savingsPercent,
        newVersion: newVersion,
        versionId: newVersionData.id,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in compress-document function:', error);
    return new Response(
      JSON.stringify({ error: 'Compression failed' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});
