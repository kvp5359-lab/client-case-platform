import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { isValidUUID } from "../_shared/validation.ts";

interface ILovePDFStartResponse {
  server: string;
  task: string;
}

interface ILovePDFUploadResponse {
  server_filename: string;
}

interface ILovePDFProcessResponse {
  download_filename: string;
  filesize: number;
  output_filesize: number;
  timer: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Authenticate user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { storagePath, quality = 'recommended' } = await req.json();

    // Валидация quality (Z8-33)
    const ALLOWED_QUALITY = ['low', 'recommended', 'extreme'];
    if (!ALLOWED_QUALITY.includes(quality)) {
      return new Response(JSON.stringify({ error: `Invalid quality. Allowed: ${ALLOWED_QUALITY.join(', ')}` }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!storagePath || typeof storagePath !== 'string' || storagePath.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid storage path' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Validate storagePath starts with a UUID (workspace_id)
    const workspaceId = storagePath.split('/')[0];
    if (!isValidUUID(workspaceId)) {
      return new Response(JSON.stringify({ error: 'Invalid storage path format' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Z8-02: Check workspace membership
    const supabaseServiceRole = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const isMember = await checkWorkspaceMembership(supabaseServiceRole, user.id, workspaceId);
    if (!isMember) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    console.log('Compressing file from storage:', storagePath);

    // Determine source bucket via document_files → files table (fallback to 'document-files')
    let sourceBucket = 'document-files';
    let sourceStoragePath = storagePath;

    const { data: docFile } = await supabaseServiceRole
      .from('document_files')
      .select('file_id')
      .eq('file_path', storagePath)
      .maybeSingle();

    if (docFile?.file_id) {
      const { data: fileRecord } = await supabaseServiceRole
        .from('files')
        .select('bucket, storage_path')
        .eq('id', docFile.file_id)
        .maybeSingle();

      if (fileRecord) {
        sourceBucket = fileRecord.bucket;
        sourceStoragePath = fileRecord.storage_path;
        console.log('Using files table: bucket =', sourceBucket, ', path =', sourceStoragePath);
      }
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseClient
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

    // iLovePDF API integration
    const publicKey = Deno.env.get('ILOVEPDF_PUBLIC_KEY');

    if (!publicKey) {
      return new Response(JSON.stringify({ error: 'iLovePDF API key not configured' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Step 0: Get JWT token
    console.log('Getting iLovePDF JWT token...');
    const authResponse = await fetch('https://api.ilovepdf.com/v1/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_key: publicKey,
      }),
    });

    if (!authResponse.ok) {
      const authError = await authResponse.json();
      console.error('Failed to authenticate with iLovePDF:', authError);
      return new Response(JSON.stringify({ error: 'Failed to authenticate with iLovePDF' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const authData = await authResponse.json();
    const jwtToken = authData.token;
    console.log('JWT token obtained');

    // Step 1: Start task
    console.log('Starting iLovePDF task...');
    const startResponse = await fetch('https://api.ilovepdf.com/v1/start/compress', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
    });

    if (!startResponse.ok) {
      console.error('Failed to start iLovePDF task:', await startResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to start compression task' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const startData: ILovePDFStartResponse = await startResponse.json();
    console.log('Task started:', startData.task);

    // Step 2: Upload file
    console.log('Uploading file to iLovePDF...');
    const fileName = storagePath.split('/').pop() || 'document.pdf';
    const formData = new FormData();
    formData.append('task', startData.task);
    formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);

    const uploadResponse = await fetch(`https://${startData.server}/v1/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      console.error('Failed to upload to iLovePDF:', await uploadResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to upload file for compression' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const uploadData: ILovePDFUploadResponse = await uploadResponse.json();
    console.log('File uploaded:', uploadData.server_filename);

    // Step 3: Process task with quality level
    console.log('Processing compression with quality:', quality);
    const processResponse = await fetch(`https://${startData.server}/v1/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: startData.task,
        tool: 'compress',
        files: [{
          server_filename: uploadData.server_filename,
          filename: fileName,
        }],
        compression_level: quality, // 'low', 'recommended', or 'extreme'
      }),
    });

    if (!processResponse.ok) {
      console.error('Failed to process compression:', await processResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to compress PDF' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const processData: ILovePDFProcessResponse = await processResponse.json();
    console.log('Compression complete. Original:', originalSize, 'Compressed:', processData.output_filesize);

    // Step 4: Download compressed file
    console.log('Downloading compressed file...');
    const downloadCompressedResponse = await fetch(
      `https://${startData.server}/v1/download/${startData.task}`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      }
    );

    if (!downloadCompressedResponse.ok) {
      console.error('Failed to download compressed file:', await downloadCompressedResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to download compressed file' }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const compressedBuffer = await downloadCompressedResponse.arrayBuffer();
    const compressedSize = compressedBuffer.byteLength;
    console.log('Downloaded compressed file size:', compressedSize);

    // Calculate savings
    const savingsPercent = Math.round((1 - compressedSize / originalSize) * 100);

    // Return compressed file
    return new Response(
      compressedBuffer,
      {
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/pdf',
          'X-Original-Size': originalSize.toString(),
          'X-Compressed-Size': compressedSize.toString(),
          'X-Savings-Percent': savingsPercent.toString(),
        },
      }
    );
  } catch (error) {
    console.error('Error in compress-pdf-ilovepdf function:', error);
    return new Response(
      JSON.stringify({ error: 'Compression failed' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    );
  }
});