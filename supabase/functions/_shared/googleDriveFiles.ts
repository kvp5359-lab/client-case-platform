/**
 * Общий обход папок Google Drive (рекурсивный листинг + имя папки).
 * Вынесено из google-drive-list-files, чтобы серверная авто-проверка
 * (sync-source-documents) и ручной листинг использовали ОДНУ логику.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
  parentFolderName?: string;
  /** В режиме groupByTopLevel — id подпапки ПЕРВОГО уровня, к которой относим
   *  файл (для точной привязки к папке набора). "" — файл в корне. */
  parentFolderId?: string;
}

const MAX_DEPTH = 5;
const MAX_FILES = 500;

/**
 * Рекурсивно собирает все файлы из папки и подпапок Google Drive.
 * groupByTopLevel: файл относим к подпапке ПЕРВОГО уровня (её имени+id), даже
 * если он лежит во вложенной подпапке. Корневые файлы получают "" (пусто).
 * Без флага — имя ближайшей папки (проектный источник).
 */
export async function listDriveFilesRecursive(
  accessToken: string,
  folderId: string,
  groupByTopLevel = false,
): Promise<DriveFile[]> {
  const walk = async (
    parentFolderId: string,
    parentFolderName = "",
    depth = 0,
    topLevelName: string | null = null,
    topLevelId: string | null = null,
  ): Promise<DriveFile[]> => {
    if (depth >= MAX_DEPTH) return [];
    const allFiles: DriveFile[] = [];

    // Содержимое папки со ВСЕХ страниц (Google Drive отдаёт до pageSize за раз;
    // без обхода nextPageToken большие папки листались частично → лишние удаления).
    const items: DriveFile[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const url =
        `https://www.googleapis.com/drive/v3/files?q='${parentFolderId}'+in+parents+and+trashed=false` +
        `&fields=nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents)` +
        `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Google Drive API error:", errorText);
        throw new Error("Failed to get files from Google Drive");
      }
      const data = await response.json();
      items.push(...((data.files as DriveFile[]) || []));
      pageToken = data.nextPageToken;
    } while (pageToken && items.length < MAX_FILES);

    const files = items.filter((item) => item.mimeType !== "application/vnd.google-apps.folder");
    const folders = items.filter((item) => item.mimeType === "application/vnd.google-apps.folder");

    for (const file of files) {
      const label = groupByTopLevel
        ? depth === 0 ? "" : topLevelName ?? ""
        : parentFolderName || "Корневая папка";
      allFiles.push({
        ...file,
        parentFolderName: label,
        parentFolderId: groupByTopLevel ? (depth === 0 ? "" : topLevelId ?? "") : undefined,
      });
    }

    for (const folder of folders) {
      if (allFiles.length >= MAX_FILES) break;
      const nextTopLevel = groupByTopLevel ? (depth === 0 ? folder.name : topLevelName) : null;
      const nextTopLevelId = groupByTopLevel ? (depth === 0 ? folder.id : topLevelId) : null;
      const subFiles = await walk(folder.id, folder.name, depth + 1, nextTopLevel, nextTopLevelId);
      allFiles.push(...subFiles);
    }

    return allFiles;
  };

  return walk(folderId);
}

/** Имя корневой папки (необязательно — при ошибке возвращает null). */
export async function getDriveFolderName(
  accessToken: string,
  folderId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.ok) {
      const data = await res.json();
      return data.name || null;
    }
  } catch {
    // не критично
  }
  return null;
}
