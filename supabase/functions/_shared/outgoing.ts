/**
 * Общие куски исходящих edge-функций (send/edit/delete/react) — единый слой
 * вместо вербатим-копий в каждой функции.
 */

/**
 * Внутреннее сообщение (team/self) — во внешний канал НЕ уходит. Единый
 * предикат вместо `(v ?? 'client') !== 'client'` в каждой send/edit-функции.
 * Сторож scripts/check-edge-invariants.mjs требует его наличия в каждой.
 */
export function isInternalVisibility(visibility: string | null | undefined): boolean {
  return (visibility ?? "client") !== "client";
}

/**
 * Членство пользователя в воркспейсе. Единая реализация — `checkWorkspaceMembership`
 * (`_shared/safeErrorResponse.ts`). Здесь оставлен алиас `assertWorkspaceMembership`,
 * чтобы исходящие функции, уже импортящие его отсюда, не переписывать. Тело — одно.
 */
export { checkWorkspaceMembership as assertWorkspaceMembership } from "./safeErrorResponse.ts";
