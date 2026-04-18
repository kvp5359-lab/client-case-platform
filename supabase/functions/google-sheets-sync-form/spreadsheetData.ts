/**
 * Build spreadsheet rows from form kit fields, sections, and values.
 */

import { safeJsonParse } from "../_shared/validation.ts";

// ---------- Types ----------

export interface FormKitField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  form_kit_section_id: string | null;
  options?: { columns?: Array<{ name: string; type: string }> };
  sort_order: number;
  field_definition_id: string;
}

export interface FormKitSection {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
}

export interface SpreadsheetRow {
  cells: string[];
  type:
    | "group"
    | "table-header"
    | "table-row"
    | "field"
    | "composite-field"
    | "nested-field"
    | "empty";
}

interface CompositeItem {
  composite_field_id: string;
  nested_field_definition_id: string;
  nested_field: { name: string } | null;
  is_required?: boolean;
  sort_order?: number;
}

// ---------- Helpers ----------

function formatFieldValue(field: FormKitField, value: string): string {
  if (!value) return "";

  if (field.field_type === "date") {
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return value;
      return d.toLocaleDateString("ru-RU");
    } catch {
      return value;
    }
  }

  if (field.field_type === "checkbox") {
    if (value === "true") return "Да";
    if (value === "false") return "Нет";
    return "";
  }

  return value;
}

function renderFieldRows(
  field: FormKitField,
  formData: Record<string, string>,
  compositeItemsByFieldId: Map<string, CompositeItem[]>,
  rows: SpreadsheetRow[],
): void {
  if (field.field_type === "composite") {
    const items = compositeItemsByFieldId.get(field.field_definition_id) || [];
    rows.push({
      cells: [field.name + (field.is_required ? " *" : ""), "", "", ""],
      type: "composite-field",
    });

    items.forEach((item, index) => {
      if (!item.nested_field) return;
      const compositeKey = `${item.composite_field_id}:${item.nested_field_definition_id}`;
      const nestedValue = formData[compositeKey] || "";
      const prefix = index === items.length - 1 ? "  └─ " : "  ├─ ";
      rows.push({
        cells: [
          prefix + item.nested_field.name + (item.is_required ? " *" : ""),
          nestedValue,
          "",
          "",
        ],
        type: "nested-field",
      });
    });
  } else if (field.field_type === "key-value-table") {
    const value = formData[field.field_definition_id] || "";
    rows.push({
      cells: [field.name + (field.is_required ? " *" : ""), "", "", ""],
      type: "composite-field",
    });

    if (value) {
      const tableRows = safeJsonParse<unknown[]>(value);
      if (Array.isArray(tableRows) && tableRows.length > 0) {
        const columns = field.options?.columns || [
          { name: "Ключ", type: "text" },
          { name: "Значение", type: "text" },
        ];

        const colNames = columns.map((col) => col.name);
        rows.push({
          cells: [colNames[0] || "", colNames[1] || "", colNames[2] || "", colNames[3] || ""],
          type: "table-header",
        });

        tableRows.forEach((row) => {
          const cells: string[] = ["", "", "", ""];
          if (Array.isArray(row)) {
            for (let i = 0; i < Math.min(row.length, 4); i++) {
              cells[i] = String(row[i] || "");
            }
          } else if (typeof row === "object" && row !== null) {
            const values = Object.values(row);
            for (let i = 0; i < Math.min(values.length, 4); i++) {
              cells[i] = String(values[i] || "");
            }
          }
          rows.push({ cells, type: "table-row" });
        });
      }
    }
  } else {
    const value = formData[field.field_definition_id] || "";
    const formattedValue = formatFieldValue(field, value);
    rows.push({
      cells: [field.name + (field.is_required ? " *" : ""), formattedValue, "", ""],
      type: "field",
    });
  }
}

// ---------- Main builder ----------

export function buildSpreadsheetData(
  fields: FormKitField[],
  sections: FormKitSection[],
  formData: Record<string, string>,
  compositeItems: CompositeItem[],
): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];

  // Group composite items by field
  const compositeItemsByFieldId = new Map<string, CompositeItem[]>();
  compositeItems.forEach((item) => {
    const id = item.composite_field_id;
    if (!compositeItemsByFieldId.has(id)) {
      compositeItemsByFieldId.set(id, []);
    }
    compositeItemsByFieldId.get(id)!.push(item);
  });

  compositeItemsByFieldId.forEach((items) => {
    items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });

  // Group fields by sections
  const fieldsBySection = sections
    .map((section) => ({
      section,
      fields: fields
        .filter((f) => f.form_kit_section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((g) => g.fields.length > 0)
    .sort((a, b) => a.section.sort_order - b.section.sort_order);

  const fieldsWithoutSection = fields
    .filter((f) => !f.form_kit_section_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Sections with fields
  fieldsBySection.forEach(({ section, fields: sectionFields }) => {
    rows.push({
      cells: [`[Группа: ${section.name || "Без названия"}]`, "", "", ""],
      type: "group",
    });

    sectionFields.forEach((field) => {
      renderFieldRows(field, formData, compositeItemsByFieldId, rows);
    });

    rows.push({ cells: ["", "", "", ""], type: "empty" });
  });

  // Fields without section
  if (fieldsWithoutSection.length > 0) {
    rows.push({ cells: ["Прочие поля", "", "", ""], type: "group" });
    rows.push({ cells: ["", "", "", ""], type: "empty" });

    fieldsWithoutSection.forEach((field) => {
      renderFieldRows(field, formData, compositeItemsByFieldId, rows);
    });
  }

  return rows;
}