-- Fix (security): record_telegram_bot_msg_id was EXECUTE-grantable by anon (and
-- authenticated) while being SECURITY DEFINER and WRITING into project_messages
-- (per-bot telegram_message_id map). Only the edge service-role path calls it
-- (_shared/syncTelegramIncomingMessage.ts via the service client), so client
-- roles never need it. Restrict to service_role, matching the other write RPCs
-- (append_telegram_message_id, dispatch_send_http).
REVOKE EXECUTE ON FUNCTION public.record_telegram_bot_msg_id(uuid, text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_telegram_bot_msg_id(uuid, text, bigint) FROM authenticated;
