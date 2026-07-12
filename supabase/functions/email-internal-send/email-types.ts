/**
 * Общие типы email-internal-send: строки БД + контекст отправки. Вынесены из
 * index.ts (распил 2026-07-12), используются и хендлером, и транспортами.
 */
import type { getServiceClient } from "../_shared/edge.ts";

export interface MessageRow {
  id: string;
  content: string | null;
  sender_name: string | null;
  has_attachments: boolean;
  email_in_reply_to: string | null;
  email_references: string[] | null;
  email_subject: string | null;
  email_send_method: string | null;
  email_send_account_id: string | null;
  thread_id: string;
  workspace_id: string;
  created_at: string;
  visibility: string | null;
}

export interface ThreadRow {
  id: string;
  short_id: number | null;
  email_subject_root: string | null;
  email_last_external_address: string | null;
  email_send_account_id: string | null;
  email_send_method: string | null;
}

export interface WorkspaceRow {
  id: string;
  slug: string;
  email_active: boolean;
}

/** Вложение исходящего письма: байты для Gmail RFC2822, base64 для Resend. */
export interface OutboundAttachment {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  base64: string;
}

/**
 * Общий контекст отправки письма — всё, что вычислено в хендлере до выбора
 * канала (тема, тело, threading, вложения). Передаётся в ветку-отправщик.
 * Две ветки (Gmail/Resend) — функции в email-transports.ts.
 */
export interface OutboundEmailCtx {
  service: ReturnType<typeof getServiceClient>;
  m: MessageRow;
  t: ThreadRow;
  req: Request;
  senderName: string;
  subjectRaw: string;
  subjectRoot: string;
  inReplyTo: string | null;
  references: string[];
  html: string;
  text: string;
  attachments: OutboundAttachment[];
}
