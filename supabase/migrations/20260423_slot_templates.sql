-- Справочник шаблонов слотов + привязка статьи БЗ ко всем уровням слотов
--
-- Мотивация: типовые слоты («Загранпаспорт», «Диплом») переиспользуются
-- в десятках шаблонов. Вместо того чтобы описывать один и тот же слот каждый раз,
-- делаем workspace-справочник заготовок. Выбор из справочника = копирование
-- полей в инлайн-слот шаблона (не live-reference, чтобы не ломать уже созданные
-- проекты при редактировании каталога).
--
-- Схема: все три уровня слотов (шаблон папки, инлайн-слоты набора документов,
-- реальный слот в проекте) получают knowledge_article_id — связь со статьёй базы
-- знаний как у folder_templates.folders.

-- 1. Справочник шаблонов слотов
CREATE TABLE IF NOT EXISTS slot_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  knowledge_article_id UUID REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slot_templates_workspace ON slot_templates(workspace_id);

ALTER TABLE slot_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY slot_templates_access ON slot_templates
  FOR ALL
  USING (
    workspace_id IN (
      SELECT participants.workspace_id
      FROM participants
      WHERE participants.user_id = auth.uid() AND participants.is_deleted = false
    )
  );

-- 2. Привязка статьи БЗ к слотам всех уровней
ALTER TABLE folder_template_slots
  ADD COLUMN IF NOT EXISTS knowledge_article_id UUID
  REFERENCES knowledge_articles(id) ON DELETE SET NULL;

ALTER TABLE document_kit_template_folder_slots
  ADD COLUMN IF NOT EXISTS knowledge_article_id UUID
  REFERENCES knowledge_articles(id) ON DELETE SET NULL;

ALTER TABLE folder_slots
  ADD COLUMN IF NOT EXISTS knowledge_article_id UUID
  REFERENCES knowledge_articles(id) ON DELETE SET NULL;
