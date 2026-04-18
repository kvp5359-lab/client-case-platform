/**
 * iLovePDF API service for PDF compression.
 * Used by: compress-document.
 *
 * Provides: full compress pipeline (auth → start → upload → process → download).
 */

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

export type CompressionQuality = "low" | "recommended" | "extreme";

export interface CompressResult {
  compressedBuffer: ArrayBuffer;
  compressedSize: number;
  outputFilesize: number;
}

/**
 * Compress a PDF file via iLovePDF API.
 *
 * Steps: authenticate → start task → upload → process → download result.
 * Throws on any API error.
 */
export async function compressPdf(
  publicKey: string,
  fileBuffer: ArrayBuffer,
  fileName: string,
  quality: CompressionQuality = "recommended",
): Promise<CompressResult> {
  // Step 0: Get JWT token
  console.log("Getting iLovePDF JWT token...");
  const authResponse = await fetch("https://api.ilovepdf.com/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: publicKey }),
  });

  if (!authResponse.ok) {
    const authError = await authResponse.json();
    console.error("Failed to authenticate with iLovePDF:", authError);
    throw new Error("Failed to authenticate with iLovePDF");
  }

  const authData = await authResponse.json();
  const jwtToken = authData.token;
  console.log("JWT token obtained");

  // Step 1: Start task
  console.log("Starting iLovePDF task...");
  const startResponse = await fetch("https://api.ilovepdf.com/v1/start/compress", {
    method: "GET",
    headers: { Authorization: `Bearer ${jwtToken}` },
  });

  if (!startResponse.ok) {
    console.error("Failed to start iLovePDF task:", await startResponse.text());
    throw new Error("Failed to start compression task");
  }

  const startData: ILovePDFStartResponse = await startResponse.json();
  console.log("Task started:", startData.task);

  // Step 2: Upload file
  console.log("Uploading file to iLovePDF...");
  const formData = new FormData();
  formData.append("task", startData.task);
  formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName);

  const uploadResponse = await fetch(`https://${startData.server}/v1/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwtToken}` },
    body: formData,
  });

  if (!uploadResponse.ok) {
    console.error("Failed to upload to iLovePDF:", await uploadResponse.text());
    throw new Error("Failed to upload file for compression");
  }

  const uploadData: ILovePDFUploadResponse = await uploadResponse.json();
  console.log("File uploaded:", uploadData.server_filename);

  // Step 3: Process task with quality level
  console.log("Processing compression with quality:", quality);
  const processResponse = await fetch(`https://${startData.server}/v1/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task: startData.task,
      tool: "compress",
      files: [{
        server_filename: uploadData.server_filename,
        filename: fileName,
      }],
      compression_level: quality,
    }),
  });

  if (!processResponse.ok) {
    console.error("Failed to process compression:", await processResponse.text());
    throw new Error("Failed to compress PDF");
  }

  const processData: ILovePDFProcessResponse = await processResponse.json();
  console.log("Compression complete. Output filesize:", processData.output_filesize);

  // Step 4: Download compressed file
  console.log("Downloading compressed file...");
  const downloadResponse = await fetch(
    `https://${startData.server}/v1/download/${startData.task}`,
    { headers: { Authorization: `Bearer ${jwtToken}` } },
  );

  if (!downloadResponse.ok) {
    console.error("Failed to download compressed file:", await downloadResponse.text());
    throw new Error("Failed to download compressed file");
  }

  const compressedBuffer = await downloadResponse.arrayBuffer();
  const compressedSize = compressedBuffer.byteLength;
  console.log("Downloaded compressed file size:", compressedSize);

  return {
    compressedBuffer,
    compressedSize,
    outputFilesize: processData.output_filesize,
  };
}
