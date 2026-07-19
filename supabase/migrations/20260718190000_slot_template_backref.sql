-- Обратная ссылка downstream-слотов на шаблон слота (справочник slot_templates).
--
-- Причина: статья/описание/промпты, привязанные к шаблону слота, копировались
-- по значению вниз (folder_template_slots → document_kit_template_folder_slots →
-- folder_slots) без обратной связи. Правка в справочнике не доходила до уже
-- созданных слотов → у слотов проекта не показывалась кнопка «?».
--
-- Теперь slot_template_id — обратная ссылка; приложение резолвит эффективную
-- статью/описание как local ?? slot_template (справочник — источник по
-- умолчанию, локальное значение перебивает). Связь ставится точечно при
-- копировании (пикер справочника, сборка проекта из набора); бэкфилл ниже
-- линкует исторические данные по УНИКАЛЬНОМУ совпадению имени в воркспейсе.

ALTER TABLE public.folder_template_slots
  ADD COLUMN IF NOT EXISTS slot_template_id uuid REFERENCES public.slot_templates(id) ON DELETE SET NULL;
ALTER TABLE public.document_kit_template_folder_slots
  ADD COLUMN IF NOT EXISTS slot_template_id uuid REFERENCES public.slot_templates(id) ON DELETE SET NULL;
ALTER TABLE public.folder_slots
  ADD COLUMN IF NOT EXISTS slot_template_id uuid REFERENCES public.slot_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fts_slot_template ON public.folder_template_slots (slot_template_id);
CREATE INDEX IF NOT EXISTS idx_dktfs_slot_template ON public.document_kit_template_folder_slots (slot_template_id);
CREATE INDEX IF NOT EXISTS idx_folder_slots_slot_template ON public.folder_slots (slot_template_id);

-- Бэкфилл по уникальному совпадению имени в воркспейсе (эвристика для истории).
UPDATE public.folder_template_slots t
SET slot_template_id = st.id
FROM public.slot_templates st
WHERE st.workspace_id = t.workspace_id AND st.name = t.name AND t.slot_template_id IS NULL
  AND (SELECT count(*) FROM public.slot_templates s2 WHERE s2.workspace_id=t.workspace_id AND s2.name=t.name) = 1;

UPDATE public.folder_slots t
SET slot_template_id = st.id
FROM public.slot_templates st
WHERE st.workspace_id = t.workspace_id AND st.name = t.name AND t.slot_template_id IS NULL
  AND (SELECT count(*) FROM public.slot_templates s2 WHERE s2.workspace_id=t.workspace_id AND s2.name=t.name) = 1;

UPDATE public.document_kit_template_folder_slots t
SET slot_template_id = st.id
FROM public.document_kit_template_folders kf
JOIN public.document_kit_templates kt ON kt.id = kf.kit_template_id
CROSS JOIN public.slot_templates st
WHERE t.kit_folder_id = kf.id
  AND st.workspace_id = kt.workspace_id AND st.name = t.name
  AND t.slot_template_id IS NULL
  AND (SELECT count(*) FROM public.slot_templates s2 WHERE s2.workspace_id=kt.workspace_id AND s2.name=t.name) = 1;
