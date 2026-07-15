/**
 * Типы для шаблонов тредов (thread_templates + thread_template_assignees)
 */


export type ThreadTemplateAssignee = {
  participant_id: string
}

/**
 * Псевдо-исполнитель «Создатель задачи» — показывается пунктом в списке
 * исполнителей шаблона. В БД хранится флагом thread_templates.assign_to_creator
 * (в таблицу исполнителей его не записать: там FK на конкретного участника).
 */
export const CREATOR_ASSIGNEE_ID = '__creator__'

/**
 * Пер-проектные переопределения полей шаблона треда для конкретного типа
 * проекта (хранятся в связке project_template_thread_templates + таблице
 * project_template_thread_assignees). Заполняется только при загрузке шаблона
 * через junction типа проекта (mapJunctionRow). Общий шаблон в библиотеке при
 * этом не меняется — здесь лежит «поверх».
 *
 * Скалярные поля: null = наследовать из общего шаблона. Пустая строка у
 * initial_message_html = осознанное переопределение «без сообщения».
 * Исполнители: assignees_overridden=false → наследуем thread_template_assignees;
 * true → используем override_assignee_ids (даже пустой набор = «никого»).
 */
export type ThreadTemplateProjectOverride = {
  /** id строки-привязки — ключ для общей БД-функции применения (folding).
   *  Есть только когда override загружен из БД (mapJunctionRow); форма
   *  редактора его не строит. */
  bindingId?: string
  deadline_days: number | null
  initial_message_html: string | null
  access_type: 'all' | 'roles' | null
  access_roles: string[] | null
  assignees_overridden: boolean
  override_assignee_ids: string[]
}

export type ThreadTemplate = {
  id: string
  workspace_id: string
  /**
   * When set, the template belongs to a specific project template and is
   * only visible inside projects of that type. When null, the template is
   * global (shown in workspace settings and in every project's "+" menu).
   */
  owner_project_template_id: string | null
  /**
   * Проект по умолчанию. Когда задан — тред из этого шаблона, созданный там,
   * где нет контекста проекта (глобальное меню «+/Новый»), сразу заводится в
   * этом проекте. NULL = проект выбирается при создании как раньше.
   */
  default_project_id: string | null
  /**
   * Описание по умолчанию для создаваемого треда (project_threads.description —
   * внутренняя заметка команды). Отдельно от `description` — та описывает сам
   * шаблон (список/поиск). NULL = без предзаполнения.
   */
  default_description: string | null
  name: string
  description: string | null
  thread_type: 'chat' | 'task'
  is_email: boolean
  assign_to_creator?: boolean
  thread_name_template: string | null
  accent_color: string
  icon: string
  access_type: 'all' | 'roles'
  access_roles: string[] | null
  default_status_id: string | null
  deadline_days: number | null
  /**
   * Если задача, созданная по этому шаблону, переходит в финальный статус —
   * проект автоматически переводится в этот статус (uuid из statuses).
   * NULL = автоперехода нет. Применяется только для thread_type='task'.
   * Применение делает БД-триггер `auto_advance_project_status`.
   */
  on_complete_set_project_status_id: string | null
  default_contact_email: string | null
  email_subject_template: string | null
  initial_message_html: string | null
  sort_order: number
  /** Группа задач шаблона (project_template_task_groups.id) или null = верхний уровень. */
  task_group_id?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined from thread_template_assignees (ОБЩИЕ исполнители шаблона)
  thread_template_assignees?: ThreadTemplateAssignee[]
  /**
   * Пер-проектные переопределения. Присутствует ТОЛЬКО когда шаблон загружен
   * в контексте типа проекта (через junction). undefined = общий шаблон из
   * библиотеки. Базовые поля объекта (deadline_days/access_type/… + исполнители)
   * остаются «рыбой» общего шаблона — эффективное значение = override ?? база.
   */
  projectOverride?: ThreadTemplateProjectOverride
}

export type ThreadTemplateFormData = {
  name: string
  description: string
  thread_type: 'chat' | 'task'
  is_email: boolean
  assign_to_creator: boolean
  thread_name_template: string
  accent_color: string
  icon: string
  access_type: 'all' | 'roles'
  access_roles: string[]
  default_status_id: string | null
  default_project_id: string | null
  default_description: string | null
  deadline_days: number | null
  on_complete_set_project_status_id: string | null
  assignee_ids: string[] // participant IDs
  default_contact_email: string
  email_subject_template: string
  initial_message_html: string
  /**
   * Когда задано — сохранение идёт как пер-проектное переопределение в junction
   * типа проекта (эти поля не пишутся в общий шаблон). undefined = обычное
   * сохранение общего шаблона (библиотека или создание нового).
   */
  projectOverride?: ThreadTemplateProjectOverride
}
