-- Индексы для поиска входящих email-цепочек по In-Reply-To / References.
--
-- Когда клиент отвечает на наше письмо, его mail-клиент ставит Message-ID
-- нашего исходящего в заголовки In-Reply-To / References. Чтобы определить
-- к какому треду относится новое входящее, webhook должен найти существующее
-- сообщение с этим Message-ID и взять у него thread_id.
--
-- Поле email_message_id заполняется новым email-internal-send (после
-- 2026-04). Старые сообщения (source='email' через старый gmail-send)
-- хранят Message-ID только в email_metadata->>'message_id_header'. Чтобы
-- покрыть оба пути — индексы на обе колонки.

-- Прямое поле email_message_id: уже строковое, делаем простой btree.
CREATE INDEX IF NOT EXISTS idx_project_messages_email_message_id
  ON project_messages (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- email_metadata — jsonb. Индекс на expression-ключе message_id_header.
CREATE INDEX IF NOT EXISTS idx_project_messages_email_metadata_message_id
  ON project_messages ((email_metadata->>'message_id_header'))
  WHERE email_metadata IS NOT NULL AND email_metadata ? 'message_id_header';
