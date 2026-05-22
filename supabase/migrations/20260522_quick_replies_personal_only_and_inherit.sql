-- Новый режим доступа «Только без проектов» + наследование настроек шаблона от группы.

ALTER TABLE quick_reply_groups
  ADD COLUMN personal_only boolean NOT NULL DEFAULT false;

ALTER TABLE quick_replies
  ADD COLUMN personal_only boolean NOT NULL DEFAULT false,
  ADD COLUMN access_inherits boolean NOT NULL DEFAULT true;

-- Бэкфилл: шаблоны с собственными junction-привязками — НЕ наследуют
UPDATE quick_replies r
SET access_inherits = false
WHERE EXISTS (
  SELECT 1 FROM quick_reply_templates qrt WHERE qrt.reply_id = r.id
);

-- Шаблоны без группы — наследовать нечего
UPDATE quick_replies
SET access_inherits = false
WHERE group_id IS NULL;
