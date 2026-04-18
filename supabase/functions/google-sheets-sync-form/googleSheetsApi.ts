/**
 * Google Sheets API helpers: create/get spreadsheet, write data, get sheet ID.
 */

import type { SpreadsheetRow } from "./spreadsheetData.ts";

/** Extract folder ID from Google Drive folder link. */
export function extractFolderIdFromLink(link: string): string | null {
  if (!link) return null;

  const folderMatch = link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  if (/^[a-zA-Z0-9_-]+$/.test(link)) return link;

  return null;
}

/** Create a new spreadsheet or reuse an existing one. */
export async function createOrGetSpreadsheet(
  accessToken: string,
  spreadsheetName: string,
  parentFolderId: string,
  existingSpreadsheetId?: string,
): Promise<{ spreadsheetId: string; isNew: boolean }> {
  if (existingSpreadsheetId) {
    try {
      const checkResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existingSpreadsheetId}?fields=id,name,trashed`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (checkResponse.ok) {
        const fileData = await checkResponse.json();
        if (!fileData.trashed) {
          if (fileData.name !== spreadsheetName) {
            try {
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${existingSpreadsheetId}`,
                {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ name: spreadsheetName }),
                },
              );
            } catch (e) {
              console.warn("Error renaming spreadsheet:", e);
            }
          }
          return { spreadsheetId: existingSpreadsheetId, isNew: false };
        }
      }
    } catch {
      // Existing spreadsheet not found, will create new one
    }
  }

  const createResponse = await fetch(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title: spreadsheetName },
        sheets: [
          {
            properties: {
              title: "Sheet1",
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
          },
        ],
      }),
    },
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Failed to create Google Spreadsheet: ${errorText}`);
  }

  const spreadsheetData = await createResponse.json();
  const spreadsheetId = spreadsheetData.spreadsheetId;

  // Move to project folder
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (e) {
    console.warn("Failed to move spreadsheet to folder:", e);
  }

  return { spreadsheetId, isNew: true };
}

/** Get the numeric sheet ID of the first sheet. */
export async function getSheetId(
  accessToken: string,
  spreadsheetId: string,
): Promise<number | null> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) return null;

  const data = await response.json();
  if (data.sheets?.length > 0) {
    const sheet =
      data.sheets.find((s: { properties?: { title?: string } }) => s.properties?.title === "Sheet1") ||
      data.sheets[0];
    return sheet.properties?.sheetId ?? null;
  }

  return null;
}

/** Write row data to the spreadsheet. */
export async function writeData(
  accessToken: string,
  spreadsheetId: string,
  data: SpreadsheetRow[],
): Promise<void> {
  if (!data || data.length === 0) return;

  const range = `Sheet1!A1:D${data.length}`;

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: data.map((row) => row.cells) }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to write data: ${errorText}`);
  }
}

/** Update the spreadsheet title via Sheets API. */
export async function updateSpreadsheetTitle(
  accessToken: string,
  spreadsheetId: string,
  title: string,
): Promise<void> {
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: { title },
                fields: "title",
              },
            },
          ],
        }),
      },
    );
  } catch (e) {
    console.warn("Error updating spreadsheet title:", e);
  }
}