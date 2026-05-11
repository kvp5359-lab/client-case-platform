/**
 * Фабрика query keys для React Query.
 *
 * Единый источник правды для всех ключей кэша. Импортируется через
 * `import { ... } from '@/hooks/queryKeys'` — алиас резолвится в этот
 * barrel-файл, который реэкспортирует все тематические модули.
 *
 * Структура (по доменам):
 * - constants.ts   — STALE_TIME / GC_TIME
 * - projects.ts    — проекты, шаблоны, доступы, треды как сущности, AI, дайджест
 * - workspace.ts   — сам воркспейс, сайдбар, настройки
 * - messenger.ts   — сообщения, inbox, личные диалоги, реакции, helpers
 * - documents.ts   — документы и наборы документов
 * - forms.ts       — form-kit, form-template, field definitions
 * - knowledge.ts   — база знаний и Q&A
 * - participants.ts — participants/project_participants, permissions
 * - templates.ts   — thread templates, lead routing, slot templates
 * - directories.ts — custom directories, statuses, quick replies
 * - finance.ts     — справочники финансового модуля
 * - integrations.ts — Telegram/Gmail/Wazzup интеграции
 * - misc.ts        — всё прочее
 */

export * from './constants'
export * from './projects'
export * from './workspace'
export * from './messenger'
export * from './documents'
export * from './forms'
export * from './knowledge'
export * from './participants'
export * from './templates'
export * from './directories'
export * from './finance'
export * from './integrations'
export * from './misc'
