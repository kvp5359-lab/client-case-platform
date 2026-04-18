export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return uint8ArrayToBase64(bytes);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 4096;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(
      String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + CHUNK, bytes.length)) as unknown as number[],
      ),
    );
  }
  return btoa(parts.join(""));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  return arrayBufferToBase64(arrayBuffer);
}
