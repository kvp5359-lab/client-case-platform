-- HOTFIX: project_messages.source — это enum (message_source), а не text.
-- Миграция 20260503_wazzup_integration.sql думала, что это text+CHECK, и
-- расширения enum'а не сделала. Без этого webhook ловит сообщения от
-- Wazzup, но падает на INSERT с ошибкой "invalid input value for enum".

ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'wazzup';
