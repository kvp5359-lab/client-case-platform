/**
 * Движок создания проекта из шаблона.
 *
 * Вынесен из CreateProjectDialog.handleSubmit (был ~210 строк в обработчике
 * формы — не тестировался, не переиспользовался). Тут чистая оркестрация
 * IO: INSERT проекта → наборы документов/анкеты → инстанциация тредов из
 * thread_templates (с assignees) → разворачивание «рыбы» плана.
 *
 * UI-уведомления (toast) сюда НЕ тащим — функция возвращает результат с
 * числом частичных сбоев, диалог сам решает, что показать.
 */

import { addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { createDocumentKitFromTemplate } from '@/services/api/documents/documentKitService'
import { createFormKitFromTemplate } from '@/services/api/forms/formKitService'
import { logger } from '@/utils/logger'
import type { ThreadTemplate } from '@/types/threadTemplate'

export type CreateProjectFromTemplateInput = {
  workspaceId: string
  name: string
  description: string
  templateId: string | undefined
  selectedDocKitIds: string[]
  selectedFormIds: string[]
  /** Шаблоны тредов (задачи/чаты), отмеченные к созданию. */
  selectedThreadTemplates: ThreadTemplate[]
  /** id блоков плана-шаблона, отмеченных к разворачиванию. */
  selectedBlockIds: Set<string>
}

export type CreateProjectFromTemplateResult = {
  projectId: string
  /** Сколько наборов документов/анкет не удалось создать (проект всё равно создан). */
  kitFormFailures: number
}

export type SeedProjectContentInput = {
  workspaceId: string
  projectId: string
  templateId: string | undefined
  selectedDocKitIds: string[]
  selectedFormIds: string[]
  /** Шаблоны тредов (задачи/чаты), отмеченные к созданию. */
  selectedThreadTemplates: ThreadTemplate[]
  /** id блоков плана-шаблона, отмеченных к разворачиванию. */
  selectedBlockIds: Set<string>
  /**
   * Добавление в УЖЕ существующий проект (не создание с нуля):
   *  - задачи, чьи шаблоны уже инстанциированы (по source_template_id), пропускаются;
   *  - новые задачи и блоки плана аппендятся в КОНЕЦ (sort_order после существующих),
   *    а не перенумеровывают проект с нуля.
   */
  appendMode?: boolean
}

type PlanContentBlock = {
  id: string
  block_type: string
  sort_order: number
  visible_to_client: boolean
  content: string | null
}

type PlanSeedPlan = {
  /** Новый sort_order для созданных тредов (выравнивание со структурой плана). */
  taskOrder: { threadId: string; index: number }[]
  /** Строки project_plan_blocks к вставке. */
  planRows: {
    workspace_id: string
    project_id: string
    block_type: 'heading' | 'text'
    sort_order: number
    visible_to_client: boolean
    content: string | null
  }[]
}

/**
 * Чистая функция: сводит задачи (по thread_template.sort_order) и
 * структурные блоки плана в одну шкалу и нумерует заново, чтобы заголовки/текст
 * встали между задачами как в шаблоне. Экспортируется для unit-тестов.
 */
export function buildPlanSeed(params: {
  workspaceId: string
  projectId: string
  selectedThreadTemplates: ThreadTemplate[]
  contentBlocks: PlanContentBlock[]
  threadByTemplate: Map<string, string>
  /** Сдвиг нумерации — для аппенда в существующий проект (по умолчанию 0). */
  sortOffset?: number
}): PlanSeedPlan {
  const {
    workspaceId,
    projectId,
    selectedThreadTemplates,
    contentBlocks,
    threadByTemplate,
    sortOffset = 0,
  } = params

  type SeedItem =
    | { kind: 'task'; threadId: string; sort: number }
    | { kind: 'block'; block: PlanContentBlock; sort: number }
  const items: SeedItem[] = []
  for (const tpl of selectedThreadTemplates) {
    const threadId = threadByTemplate.get(tpl.id)
    if (threadId) items.push({ kind: 'task', threadId, sort: tpl.sort_order })
  }
  for (const b of contentBlocks) {
    items.push({ kind: 'block', block: b, sort: b.sort_order })
  }
  items.sort((a, b) => a.sort - b.sort || (a.kind === 'task' ? -1 : 1))

  const taskOrder: PlanSeedPlan['taskOrder'] = []
  const planRows: PlanSeedPlan['planRows'] = []
  items.forEach((it, i) => {
    const index = i + sortOffset
    if (it.kind === 'task') {
      taskOrder.push({ threadId: it.threadId, index })
    } else {
      planRows.push({
        workspace_id: workspaceId,
        project_id: projectId,
        block_type: it.block.block_type as 'heading' | 'text',
        sort_order: index,
        visible_to_client: it.block.visible_to_client,
        content: it.block.content,
      })
    }
  })

  return { taskOrder, planRows }
}

export async function createProjectFromTemplate(
  input: CreateProjectFromTemplateInput,
): Promise<CreateProjectFromTemplateResult> {
  const { workspaceId, name, description, templateId } = input

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: name.trim(),
      description: description.trim() || null,
      workspace_id: workspaceId,
      created_by: user?.id || null,
      template_id: templateId || null,
    })
    .select()
    .single()

  if (insertError) throw insertError

  const { kitFormFailures } = await seedProjectContent({
    workspaceId,
    projectId: project.id,
    templateId,
    selectedDocKitIds: input.selectedDocKitIds,
    selectedFormIds: input.selectedFormIds,
    selectedThreadTemplates: input.selectedThreadTemplates,
    selectedBlockIds: input.selectedBlockIds,
  })

  return { projectId: project.id, kitFormFailures }
}

/**
 * Наполнение проекта контентом из шаблона (наборы документов, анкеты, задачи из
 * thread_templates, разворачивание плана) — для УЖЕ существующего проекта.
 * Используется и при создании проекта (createProjectFromTemplate), и при
 * добавлении из шаблона в существующий проект (appendMode).
 */
export async function seedProjectContent(
  input: SeedProjectContentInput,
): Promise<{ kitFormFailures: number }> {
  const {
    workspaceId,
    projectId,
    templateId,
    selectedDocKitIds,
    selectedFormIds,
    selectedBlockIds,
    appendMode = false,
  } = input

  // Дедуп задач: в существующем проекте не создаём повторно шаблоны тредов,
  // которые уже инстанциированы (по source_template_id). Наборы/анкеты повтор
  // допускают by design, их не фильтруем.
  let selectedThreadTemplates = input.selectedThreadTemplates
  let sortOffset = 0
  if (appendMode) {
    const { data: existing } = await supabase
      .from('project_threads')
      .select('source_template_id, sort_order')
      .eq('project_id', projectId)
      .eq('is_deleted', false)
    const usedTemplateIds = new Set(
      (existing ?? []).map((t) => t.source_template_id).filter(Boolean) as string[],
    )
    selectedThreadTemplates = selectedThreadTemplates.filter((t) => !usedTemplateIds.has(t.id))

    // Аппенд: новые элементы уходят в конец — за максимальный sort существующих
    // тредов и блоков плана проекта.
    const { data: existingBlocks } = await supabase
      .from('project_plan_blocks')
      .select('sort_order')
      .eq('project_id', projectId)
    const maxSort = Math.max(
      -1,
      ...(existing ?? []).map((t) => t.sort_order ?? 0),
      ...(existingBlocks ?? []).map((b) => b.sort_order ?? 0),
    )
    sortOffset = maxSort + 1
  }

  const promises: Promise<void>[] = []

  for (const docKitTemplateId of selectedDocKitIds) {
    promises.push(
      createDocumentKitFromTemplate(docKitTemplateId, projectId, workspaceId).then(() => {}),
    )
  }

  for (const formTemplateId of selectedFormIds) {
    promises.push(createFormKitFromTemplate(formTemplateId, projectId, workspaceId).then(() => {}))
  }

  // Инстанциация шаблонов тредов: создаём project_threads, копируем assignees,
  // проставляем source_template_id (чтобы меню "+" скрывало уже созданные).
  for (const tpl of selectedThreadTemplates) {
    promises.push(
      (async () => {
        const deadline =
          tpl.thread_type === 'task' && tpl.deadline_days != null
            ? addDays(new Date(), tpl.deadline_days).toISOString()
            : null
        const { data: thread, error: threadErr } = await supabase
          .from('project_threads')
          .insert({
            project_id: projectId,
            workspace_id: workspaceId,
            name: tpl.name,
            type: tpl.thread_type,
            access_type: tpl.access_type,
            access_roles: tpl.access_type === 'roles' ? (tpl.access_roles ?? []) : [],
            accent_color: tpl.accent_color,
            icon: tpl.icon,
            status_id: tpl.default_status_id,
            deadline,
            sort_order: sortOffset + tpl.sort_order + 100,
            source_template_id: tpl.id,
            // Снапшот правила автоперехода: рантайм проекта не зависит от шаблона.
            on_complete_set_project_status_id: tpl.on_complete_set_project_status_id ?? null,
          })
          .select('id')
          .single()
        if (threadErr) throw threadErr

        const assigneeIds = (tpl.thread_template_assignees ?? []).map((a) => a.participant_id)
        if (tpl.thread_type === 'task' && assigneeIds.length > 0) {
          const rows = assigneeIds.map((pid) => ({ thread_id: thread.id, participant_id: pid }))
          const { error: aErr } = await supabase.from('task_assignees').insert(rows)
          if (aErr) {
            logger.warn(`Не удалось назначить исполнителей в треде ${thread.id}: ${aErr.message}`)
          }
        }
      })(),
    )
  }

  let kitFormFailures = 0
  if (promises.length > 0) {
    const results = await Promise.allSettled(promises)
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      logger.error('Ошибки при создании наборов/анкет:', failed)
      kitFormFailures = failed.length
    }
  }

  // Разворачивание «рыбы» плана из шаблона — ПОСЛЕ создания тредов (резолвим
  // thread_template_id → созданный тред по source_template_id). Любая ошибка
  // здесь некритична — проект уже создан.
  if (templateId) {
    try {
      const { data: tmplBlocks } = await supabase
        .from('project_template_plan_blocks')
        .select('*')
        .eq('project_template_id', templateId)
        .order('sort_order', { ascending: true })
      const contentBlocks = (tmplBlocks ?? []).filter(
        (b) =>
          (b.block_type === 'heading' || b.block_type === 'text') && selectedBlockIds.has(b.id),
      )
      if (contentBlocks.length > 0) {
        const { data: createdThreads } = await supabase
          .from('project_threads')
          .select('id, source_template_id')
          .eq('project_id', projectId)
        const threadByTemplate = new Map<string, string>()
        for (const t of createdThreads ?? []) {
          if (t.source_template_id) threadByTemplate.set(t.source_template_id, t.id)
        }

        const { taskOrder, planRows } = buildPlanSeed({
          workspaceId,
          projectId,
          selectedThreadTemplates,
          contentBlocks,
          threadByTemplate,
          sortOffset,
        })

        if (taskOrder.length > 0) {
          await Promise.all(
            taskOrder.map((o) =>
              supabase.from('project_threads').update({ sort_order: o.index }).eq('id', o.threadId),
            ),
          )
        }
        if (planRows.length > 0) {
          const { error: planErr } = await supabase.from('project_plan_blocks').insert(planRows)
          if (planErr) logger.warn(`Не удалось развернуть план: ${planErr.message}`)
        }
      }
    } catch (planSeedErr) {
      logger.warn(
        `Ошибка разворачивания плана: ${
          planSeedErr instanceof Error ? planSeedErr.message : String(planSeedErr)
        }`,
      )
    }
  }

  return { kitFormFailures }
}
