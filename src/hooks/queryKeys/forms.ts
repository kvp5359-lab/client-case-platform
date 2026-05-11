/**
 * Query keys для form-kit/form-template и field definitions.
 */

export const formKitKeys = {
  all: ['form-kit'] as const,
  byProject: (projectId: string) => ['form-kit', 'project', projectId] as const,
  byId: (formKitId: string) => ['form-kit', formKitId] as const,
  detail: (formKitId: string) => ['form-kit', formKitId, 'detail'] as const,
  structure: (formKitId: string) => ['form-kit', formKitId, 'structure'] as const,
  fieldValues: (formKitId: string) => ['form-kit', formKitId, 'field-values'] as const,
  compositeItems: (formKitId: string) => ['form-kit', formKitId, 'composite-items'] as const,
  selectOptions: (formKitId: string) => ['form-kit', formKitId, 'select-options'] as const,
}

/**
 * Form-template editor: секции, поля, сам шаблон.
 */
export const formTemplateKeys = {
  detail: (templateId: string | undefined) => ['form-template', templateId] as const,
  sections: (templateId: string | undefined) => ['form-template-sections', templateId] as const,
  fields: (templateId: string | undefined) => ['form-template-fields', templateId] as const,
  listByWorkspace: (workspaceId: string | undefined) =>
    ['form-templates', workspaceId] as const,
}

/**
 * Field definitions (universal form fields).
 */
export const fieldDefinitionKeys = {
  all: ['field-definitions'] as const,
  byWorkspace: (workspaceId: string | undefined) =>
    ['field-definitions', workspaceId] as const,
  byIds: (ids: string[]) => ['field-definitions-by-ids', ids] as const,
  selectOptions: (fieldId: string | undefined) =>
    ['field-definition-select-options', fieldId] as const,
  forComposite: (fieldId: string | undefined) =>
    ['field-definitions-for-composite', fieldId] as const,
  projectValues: (projectId: string | undefined, fieldIds: string[]) =>
    ['project-field-values', projectId, fieldIds] as const,
}
