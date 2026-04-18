const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const GOOGLE_DRIVE_ID_REGEX = /^[a-zA-Z0-9_-]{10,128}$/;

export function isValidGoogleDriveId(value: string): boolean {
  return GOOGLE_DRIVE_ID_REGEX.test(value);
}

export function findMissingField(
  body: Record<string, unknown>,
  requiredFields: string[],
): string | null {
  for (const field of requiredFields) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      return field;
    }
  }
  return null;
}

export function findInvalidUUID(
  body: Record<string, unknown>,
  uuidFields: string[],
): string | null {
  for (const field of uuidFields) {
    const value = body[field];
    if (typeof value === "string" && !isValidUUID(value)) {
      return field;
    }
  }
  return null;
}
