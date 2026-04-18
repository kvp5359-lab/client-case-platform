/**
 * Google Sheets formatting: column widths, colors, bold text.
 */

import type { SpreadsheetRow } from "./spreadsheetData.ts";

interface BatchRequest {
  repeatCell?: unknown;
  updateDimensionProperties?: unknown;
}

export async function applyBasicFormatting(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  data: SpreadsheetRow[],
): Promise<void> {
  const groupRowIndices: number[] = [];
  const tableHeaderRowIndices: number[] = [];
  const compositeFieldRowIndices: number[] = [];
  const emptyRowIndices: number[] = [];

  data.forEach((row, index) => {
    const rowNumber = index + 1;
    if (row.type === "group") groupRowIndices.push(rowNumber);
    else if (row.type === "table-header") tableHeaderRowIndices.push(rowNumber);
    else if (row.type === "composite-field") compositeFieldRowIndices.push(rowNumber);

    if (row.cells.every((cell) => !cell || cell.trim() === "")) {
      emptyRowIndices.push(rowNumber);
    }
  });

  const requests: BatchRequest[] = [];

  // Reset formatting
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: data.length, startColumnIndex: 0, endColumnIndex: 4 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 1, green: 1, blue: 1 },
          textFormat: { bold: false, fontSize: 10 },
          horizontalAlignment: "LEFT",
          verticalAlignment: "TOP",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
    },
  });

  // Column widths
  const columnWidths = [320, 200, 125, 125];
  columnWidths.forEach((pixelSize, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });
  });

  // Column A — light gray background
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: data.length, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
      fields: "userEnteredFormat.backgroundColor",
    },
  });

  // Group rows — medium gray, bold 18
  groupRowIndices.forEach((rowIndex) => {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex - 1, endRowIndex: rowIndex, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 },
            textFormat: { fontSize: 18, bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  });

  // Composite field rows — bold 16
  compositeFieldRowIndices.forEach((rowIndex) => {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex - 1, endRowIndex: rowIndex, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { fontSize: 16, bold: true } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
  });

  // Table header rows — dark gray
  tableHeaderRowIndices.forEach((rowIndex) => {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex - 1, endRowIndex: rowIndex, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.7, green: 0.7, blue: 0.7 },
            textFormat: { bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  });

  // Empty rows — white background
  emptyRowIndices.forEach((rowIndex) => {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex - 1, endRowIndex: rowIndex, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
  });

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Formatting failed: ${errorText}`);
  }
}