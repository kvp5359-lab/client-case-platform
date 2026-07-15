-- «Создатель задачи» как исполнитель по умолчанию в шаблоне треда.
-- Хранить в thread_template_assignees нельзя (там FK на конкретного участника),
-- поэтому — флаг на шаблоне. В UI показывается пунктом списка исполнителей.
-- Лид-боты флаг игнорируют: у входящего диалога создателя нет (вариант А).
ALTER TABLE public.thread_templates
  ADD COLUMN IF NOT EXISTS assign_to_creator boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.thread_templates.assign_to_creator IS
  'Назначать исполнителем создателя треда (того, кто создаёт проект из шаблона). Лид-боты игнорируют — там создателя нет.';
