/**
 * Shared Google Drive helpers.
 * Used by: google-drive-export-documents, export-to-drive.
 */

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  shortcutDetails?: {
    targetId: string;
    targetMimeType: string;
  };
}

/** List all files/folders inside a Google Drive folder (paginated). */
export async function listFilesInFolder(
  folderId: string,
  accessToken: string,
): Promise<GoogleDriveFile[]> {
  const files: GoogleDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.append("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.append("fields", "nextPageToken, files(id, name, mimeType, parents, shortcutDetails)");
    url.searchParams.append("supportsAllDrives", "true");
    url.searchParams.append("includeItemsFromAllDrives", "true");
    if (pageToken) {
      url.searchParams.append("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to list files: ${await response.text()}`);
    }

    const data = await response.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

export interface DriveFolderNode {
  id: string;
  name: string;
  children: DriveFolderNode[];
}

/**
 * Recursively build the subfolder tree of a folder.
 * Sequential walk (one folder at a time) to respect Google API rate limits.
 * Caps by depth and total node count; sets `truncated` when limits hit.
 */
export async function listFolderTree(
  folderId: string,
  accessToken: string,
  opts?: { maxDepth?: number; maxNodes?: number },
): Promise<{ tree: DriveFolderNode[]; truncated: boolean }> {
  const maxDepth = opts?.maxDepth ?? 6;
  const maxNodes = opts?.maxNodes ?? 500;
  let count = 0;
  let truncated = false;

  const isFolder = (f: GoogleDriveFile) =>
    f.mimeType === "application/vnd.google-apps.folder" ||
    (f.mimeType === "application/vnd.google-apps.shortcut" &&
      f.shortcutDetails?.targetMimeType === "application/vnd.google-apps.folder");

  const resolveId = (f: GoogleDriveFile) =>
    f.mimeType === "application/vnd.google-apps.shortcut" ? f.shortcutDetails!.targetId : f.id;

  async function walk(id: string, depth: number): Promise<DriveFolderNode[]> {
    if (depth >= maxDepth) {
      truncated = true;
      return [];
    }
    const files = await listFilesInFolder(id, accessToken);
    const folders = files.filter(isFolder);
    const nodes: DriveFolderNode[] = [];
    for (const f of folders) {
      if (count >= maxNodes) {
        truncated = true;
        break;
      }
      count++;
      const childId = resolveId(f);
      const children = await walk(childId, depth + 1);
      nodes.push({ id: childId, name: f.name, children });
    }
    return nodes;
  }

  const tree = await walk(folderId, 0);
  return { tree, truncated };
}

/** Get a file/folder name by ID. Returns null if not accessible. */
export async function getFileName(
  fileId: string,
  accessToken: string,
): Promise<string | null> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.append("fields", "name");
  url.searchParams.append("supportsAllDrives", "true");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.name ?? null;
}

/** Delete a single file/folder by ID. Returns true on success. */
export async function deleteFile(
  fileId: string,
  accessToken: string,
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  return response.ok;
}

/** Create a folder in Google Drive. Returns the new folder's ID. */
export async function createDriveFolder(
  name: string,
  parentId: string,
  accessToken: string,
): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create folder "${name}": ${await response.text()}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Grant permission on a file/folder to a specific email (Drive permissions.create).
 * Без письма-уведомления от Google (sendNotificationEmail=false).
 * Throws with codes the caller maps to human messages:
 * - "insufficient_permissions" — token's account cannot share this file
 * - "folder_not_found" — file not visible to the token (deleted or no access)
 */
export async function grantFilePermission(
  fileId: string,
  email: string,
  role: "reader" | "writer",
  accessToken: string,
): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "user", role, emailAddress: email }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) throw new Error("folder_not_found");
    if (response.status === 403 && /insufficient|cannotShare|sharingRateLimit/i.test(text)) {
      throw new Error("insufficient_permissions");
    }
    throw new Error(`Failed to grant permission on ${fileId}: ${text}`);
  }

  const data = await response.json();
  return data.id as string;
}

/** Revoke a permission on a file/folder (Drive permissions.delete). */
export async function deleteFilePermission(
  fileId: string,
  permissionId: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  // 404 — permission уже снят (или папка недоступна): считаем цель достигнутой.
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    if (response.status === 403 && /insufficient|cannotDelete|cannotModify/i.test(text)) {
      throw new Error("insufficient_permissions");
    }
    throw new Error(`Failed to delete permission ${permissionId} on ${fileId}: ${text}`);
  }
}

export interface DriveFilePermission {
  id: string;
  type: string;
  role: string;
  emailAddress: string | null;
}

/** List current permissions of a file/folder (who has access). */
export async function listFilePermissions(
  fileId: string,
  accessToken: string,
): Promise<DriveFilePermission[]> {
  const permissions: DriveFilePermission[] = [];
  let pageToken: string | null = null;

  do {
    const url: string =
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions` +
      `?supportsAllDrives=true&fields=permissions(id,type,role,emailAddress),nextPageToken` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 404) throw new Error("folder_not_found");
      throw new Error(`Failed to list permissions on ${fileId}: ${await response.text()}`);
    }

    const data: {
      permissions?: Array<{ id: string; type: string; role: string; emailAddress?: string | null }>;
      nextPageToken?: string | null;
    } = await response.json();
    for (const p of data.permissions ?? []) {
      permissions.push({
        id: p.id,
        type: p.type,
        role: p.role,
        emailAddress: p.emailAddress ?? null,
      });
    }
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return permissions;
}

/** Move a file/folder from one parent to another. */
export async function moveToParent(
  fileId: string,
  oldParentId: string,
  newParentId: string,
  accessToken: string,
): Promise<boolean> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${oldParentId}&supportsAllDrives=true`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok;
}

/** Recursively collect all file/folder IDs inside a folder (BFS). */
export async function collectAllItemIds(
  folderId: string,
  accessToken: string,
): Promise<Array<{ id: string; mimeType: string }>> {
  const allItems: Array<{ id: string; mimeType: string }> = [];
  const foldersToProcess: string[] = [folderId];

  while (foldersToProcess.length > 0) {
    const currentFolderId = foldersToProcess.shift()!;
    let nextPageToken: string | undefined = undefined;

    do {
      const listUrl = `https://www.googleapis.com/drive/v3/files?q='${currentFolderId}' in parents and trashed=false&fields=files(id,mimeType),nextPageToken&supportsAllDrives=true${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
      const listResponse = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (listResponse.ok) {
        const listData = await listResponse.json();
        if (listData.files && listData.files.length > 0) {
          for (const item of listData.files) {
            allItems.push({ id: item.id, mimeType: item.mimeType });
            if (item.mimeType === "application/vnd.google-apps.folder") {
              foldersToProcess.push(item.id);
            }
          }
        }
        nextPageToken = listData.nextPageToken;
      } else {
        const errorText = await listResponse.text();
        console.error(`[googleDriveHelpers] Failed to list folder contents: ${errorText}`);
        break;
      }
    } while (nextPageToken);
  }

  return allItems;
}

/**
 * Delete all contents of a folder recursively (without deleting the folder itself).
 * Uses batched parallel deletion (10 items per batch) to respect Google API rate limits.
 */
export async function deleteFolderContentsRecursively(
  folderId: string,
  accessToken: string,
  logPrefix = "[googleDriveHelpers]",
): Promise<void> {
  console.log(`${logPrefix} Collecting all items in folder ${folderId}...`);
  const allItems = await collectAllItemIds(folderId, accessToken);
  console.log(`${logPrefix} Found ${allItems.length} items to delete`);

  if (allItems.length === 0) return;

  // Delete items in batches of 10 (Google API rate limit ~10 req/s)
  const batchSize = 10;
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const deleteResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${item.id}?supportsAllDrives=true`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          if (!deleteResponse.ok && deleteResponse.status !== 404) {
            const errorText = await deleteResponse.text();
            console.error(
              `${logPrefix} Failed to delete ${item.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file"} ${item.id}: ${errorText}`,
            );
          }
        } catch (error) {
          console.error(`${logPrefix} Error deleting item ${item.id}:`, error);
        }
      }),
    );
  }

  console.log(`${logPrefix} Successfully deleted ${allItems.length} items`);
}
