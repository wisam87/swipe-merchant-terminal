// Shared payment/transaction status vocabulary, used by BOTH the client
// (app/pay/page.tsx) and the server (webhook store / watch endpoint).
//
// The REST endpoints use COMPLETED/EXPIRED/CANCELLED; the SSE stream and
// webhooks use their own words (e.g. FULFILLED, CONFIRMED) and may send the
// status as a bare string. Classify by category, never by exact match.

export const SUCCESS_STATUSES = new Set([
  "COMPLETED",
  "CONFIRMED",
  "FULFILLED",
  "SUCCESS",
  "SUCCESSFUL",
  "PAID",
  "SETTLED",
]);

export const FAILED_STATUSES = new Set([
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "DECLINED",
  "REJECTED",
  "VOID",
  "REVERSED",
]);

export type StatusKind = "success" | "failed" | "pending";

export function classifyStatus(s?: string): StatusKind {
  if (!s) return "pending";
  const u = s.trim().toUpperCase();
  if (SUCCESS_STATUSES.has(u)) return "success";
  if (FAILED_STATUSES.has(u)) return "failed";
  return "pending";
}

// Terminal = the payment is done either way (paid or dead) — i.e. a real result.
export function isTerminal(s?: string): boolean {
  return classifyStatus(s) !== "pending";
}
