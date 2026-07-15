-- Комментарий к шаблону слота.
--
-- Зеркало 20260715210000_folder_templates_comment.sql: одноимённые шаблоны
-- («Банковская выписка») различаются только начинкой, и в списке/пикере их
-- не отличить. Внутренняя пометка для сотрудников, клиенту не показывается
-- (для клиента есть description / статья базы знаний).
--
-- Только справочник slot_templates. Слоты-экземпляры внутри папок
-- (folder_template_slots, document_kit_template_folder_slots) поля не имеют:
-- они живут в контексте своей папки, и различать их между собой не нужно.

ALTER TABLE public.slot_templates
  ADD COLUMN IF NOT EXISTS comment text;

COMMENT ON COLUMN public.slot_templates.comment IS
  'Внутренняя пометка: чем этот шаблон отличается от одноимённых. Клиенту не показывается.';
