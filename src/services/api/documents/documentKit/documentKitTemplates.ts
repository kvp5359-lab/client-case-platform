/**
 * Операции с шаблонами наборов документов — создание из шаблона и синхронизация структуры
 */

import { supabase } from '@/lib/supabase'
import { DocumentKitError, createServiceErrorHandler } from '../../../errors'
import { logger } from '@/utils/logger'

const handleServiceError = createServiceErrorHandler(DocumentKitError)

/** Тип записи из document_kit_template_folders (с инлайн-данными) */
type KitTemplateFolder = {
  id: string
  folder_template_id: string | null
  order_index: number
  name: string
  description: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
  knowledge_article_id: string | null
}

/** Получение папок шаблона набора (данные теперь хранятся прямо в записи) */
export async function getTemplateFolders(kitTemplateId: string): Promise<KitTemplateFolder[]> {
  const { data, error } = await supabase
    .from('document_kit_template_folders')
    .select(
      'id, folder_template_id, order_index, name, description, ai_naming_prompt, ai_check_prompt, knowledge_article_id',
    )
    .eq('kit_template_id', kitTemplateId)
    .order('order_index', { ascending: true })

  if (error) {
    logger.error('Ошибка получения шаблонов папок:', error)
    throw new DocumentKitError('Не удалось получить шаблоны папок', error)
  }

  return data || []
}

/** Маппинг шаблонной папки → данные для INSERT в folders */
function mapTemplateFolderToInsert(
  tf: KitTemplateFolder,
  kitId: string,
  projectId: string,
  workspaceId: string,
) {
  return {
    document_kit_id: kitId,
    project_id: projectId,
    workspace_id: workspaceId,
    folder_template_id: tf.folder_template_id,
    kit_template_folder_id: tf.id,
    name: tf.name,
    description: tf.description,
    ai_naming_prompt: tf.ai_naming_prompt,
    ai_check_prompt: tf.ai_check_prompt,
    knowledge_article_id: tf.knowledge_article_id,
    sort_order: tf.order_index,
  }
}

/**
 * Создаёт слоты в папках на основе шаблонов папок набора документов.
 * Читает слоты из document_kit_template_folder_slots (инлайн-слоты шаблона набора).
 *
 * @param folderMappings — маппинг: projectFolderId → kitTemplateFolderId
 * @param projectId — ID проекта
 * @param workspaceId — ID воркспейса
 * @param excludeKitSlotIds — ID слотов шаблона набора, которые уже созданы (опционально)
 */
async function buildSlotsFromKitTemplate(
  folderMappings: { projectFolderId: string; kitTemplateFolderId: string }[],
  projectId: string,
  workspaceId: string,
  excludeKitSlotIds?: Set<string>,
): Promise<void> {
  if (folderMappings.length === 0) return

  const kitFolderIds = folderMappings.map((m) => m.kitTemplateFolderId)

  const { data: kitSlots, error: kitSlotsError } = await supabase
    .from('document_kit_template_folder_slots')
    .select('*')
    .in('kit_folder_id', kitFolderIds)
    .order('sort_order')

  if (kitSlotsError) {
    logger.error('Ошибка получения слотов шаблона набора:', kitSlotsError)
    throw new DocumentKitError('Не удалось получить слоты шаблона набора', kitSlotsError)
  }

  if (!kitSlots || kitSlots.length === 0) return

  const slotsToCreate: {
    folder_id: string
    project_id: string
    workspace_id: string
    name: string
    description: string | null
    knowledge_article_id: string | null
    ai_naming_prompt: string | null
    ai_check_prompt: string | null
    slot_template_id: string | null
    kit_template_folder_slot_id: string
    sort_order: number
  }[] = []

  for (const mapping of folderMappings) {
    const slots = kitSlots.filter((s) => s.kit_folder_id === mapping.kitTemplateFolderId)
    for (const slot of slots) {
      if (excludeKitSlotIds?.has(slot.id)) continue
      slotsToCreate.push({
        folder_id: mapping.projectFolderId,
        project_id: projectId,
        workspace_id: workspaceId,
        name: slot.name,
        description: slot.description ?? null,
        knowledge_article_id: slot.knowledge_article_id ?? null,
        ai_naming_prompt: slot.ai_naming_prompt ?? null,
        ai_check_prompt: slot.ai_check_prompt ?? null,
        // Протягиваем связь со справочником слота — чтобы «?» резолвился в проекте.
        slot_template_id: slot.slot_template_id ?? null,
        // Якорь на слот шаблона набора — по нему синхронизируется состав слотов.
        kit_template_folder_slot_id: slot.id,
        sort_order: slot.sort_order,
      })
    }
  }

  if (slotsToCreate.length === 0) return

  const { error: slotsError } = await supabase.from('folder_slots').insert(slotsToCreate)

  if (slotsError) {
    logger.error('Ошибка создания слотов из шаблона:', slotsError)
    throw new DocumentKitError('Не удалось создать слоты из шаблона', slotsError)
  }
}

/**
 * Создание набора документов из шаблона (атомарная RPC).
 * Создаёт kit + folders + slots в одной транзакции.
 * Возвращает ID созданного набора.
 */
export async function createDocumentKitFromTemplate(
  templateId: string,
  projectId: string,
  workspaceId: string,
): Promise<string> {
  try {
    const { data: kitId, error } = await supabase.rpc('create_document_kit_from_template', {
      p_template_id: templateId,
      p_project_id: projectId,
      p_workspace_id: workspaceId,
    })

    if (error) {
      logger.error('Ошибка создания набора из шаблона:', error)
      throw new DocumentKitError('Не удалось создать набор документов из шаблона', error)
    }

    return kitId as string
  } catch (error) {
    throw handleServiceError('Не удалось создать набор документов из шаблона', error)
  }
}

/**
 * Синхронизация слотов существующих папок набора со слотами шаблона набора.
 * - Слот со связью (kit_template_folder_slot_id), у которого слот шаблона ещё
 *   существует → обновляется (имя, описание, статья, AI-промпты, порядок).
 * - Слот шаблона без пары в проекте → добавляется.
 * - Ручные слоты (без связи) и «осиротевшие» (слот шаблона удалён) → не трогаются
 *   и не удаляются.
 *
 * @param existingFolders — папки набора, уже присутствующие в проекте, с их
 *   привязкой к папке шаблона (kit_template_folder_id)
 */
async function syncSlotsForExistingFolders(
  existingFolders: { id: string; kit_template_folder_id: string }[],
  projectId: string,
  workspaceId: string,
): Promise<void> {
  if (existingFolders.length === 0) return

  const kitFolderIds = existingFolders.map((f) => f.kit_template_folder_id)

  // Слоты шаблона набора для этих папок
  const { data: kitSlots, error: kitSlotsError } = await supabase
    .from('document_kit_template_folder_slots')
    .select(
      'id, kit_folder_id, name, description, knowledge_article_id, ai_naming_prompt, ai_check_prompt, slot_template_id, sort_order',
    )
    .in('kit_folder_id', kitFolderIds)

  if (kitSlotsError) {
    logger.error('Ошибка получения слотов шаблона набора при синхронизации:', kitSlotsError)
    throw new DocumentKitError('Не удалось получить слоты шаблона набора', kitSlotsError)
  }

  const projectFolderIds = existingFolders.map((f) => f.id)

  // Слоты проекта в этих папках
  const { data: projectSlots, error: projectSlotsError } = await supabase
    .from('folder_slots')
    .select('id, folder_id, kit_template_folder_slot_id')
    .in('folder_id', projectFolderIds)

  if (projectSlotsError) {
    logger.error('Ошибка получения слотов проекта при синхронизации:', projectSlotsError)
    throw new DocumentKitError('Не удалось получить слоты проекта', projectSlotsError)
  }

  const kitSlotById = new Map((kitSlots || []).map((s) => [s.id, s]))
  // Слоты шаблона, у которых уже есть пара в проекте
  const linkedKitSlotIds = new Set(
    (projectSlots || [])
      .map((s) => s.kit_template_folder_slot_id)
      .filter((id): id is string => !!id),
  )

  // 1. Обновляем связанные слоты проекта под шаблон
  const updatePromises = (projectSlots || [])
    .filter(
      (s): s is typeof s & { kit_template_folder_slot_id: string } =>
        !!s.kit_template_folder_slot_id && kitSlotById.has(s.kit_template_folder_slot_id),
    )
    .map((s) => {
      const ks = kitSlotById.get(s.kit_template_folder_slot_id)!
      return supabase
        .from('folder_slots')
        .update({
          name: ks.name,
          description: ks.description,
          knowledge_article_id: ks.knowledge_article_id,
          ai_naming_prompt: ks.ai_naming_prompt,
          ai_check_prompt: ks.ai_check_prompt,
          slot_template_id: ks.slot_template_id,
          sort_order: ks.sort_order,
        })
        .eq('id', s.id)
    })

  const updateResults = await Promise.all(updatePromises)
  let slotUpdateErrors = 0
  for (const r of updateResults) {
    if (r.error) {
      slotUpdateErrors++
      logger.error('Ошибка обновления слота при синхронизации (продолжаем):', r.error)
    }
  }
  if (slotUpdateErrors > 0) {
    logger.warn(
      `Синхронизация слотов: ${slotUpdateErrors} из ${updateResults.length} не обновились`,
    )
  }

  // 2. Добавляем слоты шаблона, которых нет в проекте
  const projectFolderByKitFolder = new Map<string, string>()
  for (const f of existingFolders) {
    if (!projectFolderByKitFolder.has(f.kit_template_folder_id)) {
      projectFolderByKitFolder.set(f.kit_template_folder_id, f.id)
    }
  }

  const slotsToCreate = (kitSlots || [])
    .filter((ks) => !linkedKitSlotIds.has(ks.id))
    .map((ks) => {
      const folderId = projectFolderByKitFolder.get(ks.kit_folder_id)
      if (!folderId) return null
      return {
        folder_id: folderId,
        project_id: projectId,
        workspace_id: workspaceId,
        name: ks.name,
        description: ks.description ?? null,
        knowledge_article_id: ks.knowledge_article_id ?? null,
        ai_naming_prompt: ks.ai_naming_prompt ?? null,
        ai_check_prompt: ks.ai_check_prompt ?? null,
        slot_template_id: ks.slot_template_id ?? null,
        kit_template_folder_slot_id: ks.id,
        sort_order: ks.sort_order,
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  if (slotsToCreate.length > 0) {
    const { error: insertError } = await supabase.from('folder_slots').insert(slotsToCreate)
    if (insertError) {
      logger.error('Ошибка создания новых слотов при синхронизации:', insertError)
      throw new DocumentKitError('Не удалось создать новые слоты из шаблона', insertError)
    }
  }
}

/**
 * Синхронизация структуры набора документов с шаблоном.
 * Обновляет названия, описания и промпты папок согласно шаблонам.
 * Обновляет и добавляет слоты существующих папок (по якорю на слот шаблона).
 * Создаёт отсутствующие папки из шаблона.
 * Документы и вручную созданные слоты при этом не затрагиваются.
 */
export async function syncDocumentKitStructure(kitId: string, projectId: string): Promise<void> {
  try {
    // 1. Получаем данные набора документов
    const { data: kit, error: kitError } = await supabase
      .from('document_kits')
      .select('*')
      .eq('id', kitId)
      .single()

    if (kitError) {
      logger.error('Ошибка получения набора документов для синхронизации:', kitError)
      throw new DocumentKitError('Не удалось получить набор документов', kitError)
    }

    if (!kit.template_id) {
      throw new DocumentKitError('Набор не привязан к шаблону')
    }

    // 2. Получаем все папки этого набора
    const { data: folders, error: foldersError } = await supabase
      .from('folders')
      .select('id, kit_template_folder_id')
      .eq('document_kit_id', kitId)

    if (foldersError) {
      logger.error('Ошибка получения папок набора:', foldersError)
      throw new DocumentKitError('Не удалось получить папки набора', foldersError)
    }

    // 3. Получаем папки шаблона набора (данные инлайн)
    const templateFolders = await getTemplateFolders(kit.template_id)

    // 4. Маппинг: kit_template_folder.id → данные шаблонной папки
    const templateDataById = new Map<string, KitTemplateFolder>()
    for (const tf of templateFolders) {
      templateDataById.set(tf.id, tf)
    }

    // 5. Обновляем каждую папку согласно шаблону набора
    const existingKitFolders = (folders || []).filter(
      (folder): folder is typeof folder & { kit_template_folder_id: string } =>
        !!folder.kit_template_folder_id && templateDataById.has(folder.kit_template_folder_id),
    )

    const updatePromises = existingKitFolders.map((folder) => {
      const tf = templateDataById.get(folder.kit_template_folder_id)!
      return supabase
        .from('folders')
        .update({
          name: tf.name,
          description: tf.description,
          ai_naming_prompt: tf.ai_naming_prompt,
          ai_check_prompt: tf.ai_check_prompt,
          knowledge_article_id: tf.knowledge_article_id,
          sort_order: tf.order_index,
        })
        .eq('id', folder.id)
    })

    const results = await Promise.all(updatePromises)
    let updateErrors = 0
    for (const result of results) {
      if (result.error) {
        updateErrors++
        logger.error(
          'Ошибка обновления папки при синхронизации (partial sync continues):',
          result.error,
        )
      }
    }
    if (updateErrors > 0) {
      logger.warn(
        `Синхронизация: ${updateErrors} из ${results.length} папок не обновились, продолжаем`,
      )
    }

    // 5b. Синхронизируем слоты существующих папок со слотами шаблона набора
    await syncSlotsForExistingFolders(existingKitFolders, projectId, kit.workspace_id)

    // 6. Находим шаблоны папок, которых нет в текущем наборе
    const existingKitTemplateFolderIds = new Set(
      (folders || []).map((f) => f.kit_template_folder_id).filter((id): id is string => !!id),
    )

    const missingTemplates = templateFolders.filter(
      (tf) => !existingKitTemplateFolderIds.has(tf.id),
    )

    // 7. Создаём отсутствующие папки из шаблона
    if (missingTemplates.length > 0) {
      const foldersToCreate = missingTemplates.map((tf) =>
        mapTemplateFolderToInsert(tf, kitId, projectId, kit.workspace_id),
      )

      const { data: createdFolders, error: createError } = await supabase
        .from('folders')
        .insert(foldersToCreate)
        .select('id')

      if (createError) {
        logger.error('Ошибка создания отсутствующих папок при синхронизации:', createError)
        throw new DocumentKitError('Не удалось создать отсутствующие папки', createError)
      }

      // Копируем слоты из шаблона набора для новых папок
      if (createdFolders && createdFolders.length > 0) {
        const folderMappings = createdFolders.map((cf, i) => ({
          projectFolderId: cf.id,
          kitTemplateFolderId: missingTemplates[i].id,
        }))
        await buildSlotsFromKitTemplate(folderMappings, projectId, kit.workspace_id)
      }
    }
  } catch (error) {
    handleServiceError('Не удалось синхронизировать набор с шаблоном', error)
  }
}
