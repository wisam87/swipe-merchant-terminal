import "server-only";
import { isTerminal } from "@/app/lib/status";

// Records transaction webhook events so the browser (which can't read Swipe's
// GET endpoints from a datacenter IP) can learn when a payment completed.
//
// Storage: uses Upstash/Vercel KV REST if KV_REST_API_URL + KV_REST_API_TOKEN
// are set (REQUIRED on Vercel — serverless invocations don't share memory, so
// the webhook POST and the browser's poll run in different lambdas). Falls back
// to in-memory for local dev / a single long-lived process.

export type WebhookTxn = {
  reference: string; // transaction_code (ST…)
  transactionId: string;
  status: string;
  amount: number; // net amount (post-fee)
  grossAmount: number; // what the customer paid — matches the create amount
  currency: string;
  at: number; // received time (ms epoch)
};

// Accept either naming — Vercel's KV integration injects KV_REST_API_*, while
// Upstash's own dashboard gives UPSTASH_REDIS_REST_*. Both expose the same
// REST protocol this store uses.
const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const useKv = Boolean(KV_URL && KV_TOKEN);
const KEY = "swipe:webhook:events";
const MAX = 200;
const TTL_SECONDS = 3600;

// Pin the in-memory fallback on globalThis so it's shared across route modules
// and survives dev HMR (module-level state alone gets reset). This only helps a
// single process — on Vercel's separate lambdas you still need KV (above).
const globalForStore = globalThis as unknown as { __swipeWebhookMem?: WebhookTxn[] };
const mem: WebhookTxn[] = (globalForStore.__swipeWebhookMem ??= []);

export function storeMode(): "kv" | "memory" {
  return useKv ? "kv" : "memory";
}

async function kv(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    // Upstash REST wants all command args as strings.
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`KV ${cmd[0]} failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return ((await res.json()) as { result: unknown }).result;
}

export async function recordEvent(t: WebhookTxn): Promise<void> {
  if (useKv) {
    await kv(["LPUSH", KEY, JSON.stringify(t)]);
    await kv(["LTRIM", KEY, 0, MAX - 1]);
    await kv(["EXPIRE", KEY, TTL_SECONDS]);
    return;
  }
  if (process.env.VERCEL) {
    console.warn(
      "[swipe webhook] storing in-memory on Vercel — the poll runs in a DIFFERENT " +
        "lambda and will NOT see this event. Add Upstash/Vercel KV (KV_REST_API_URL " +
        "+ KV_REST_API_TOKEN) for cross-invocation delivery.",
    );
  }
  mem.unshift(t);
  if (mem.length > MAX) mem.length = MAX;
}

async function recent(): Promise<WebhookTxn[]> {
  if (useKv) {
    const rows = ((await kv(["LRANGE", KEY, 0, MAX - 1])) as string[]) ?? [];
    return rows
      .map((r) => {
        try {
          return JSON.parse(r) as WebhookTxn;
        } catch {
          return null;
        }
      })
      .filter((x): x is WebhookTxn => x !== null);
  }
  return mem;
}

// For the debug endpoint — recent events without throwing.
export async function debugRecent(): Promise<WebhookTxn[]> {
  try {
    return await recent();
  } catch (e) {
    console.error("[swipe webhook] store read failed:", e);
    return [];
  }
}

const EPS = 0.001;

// Match a waiting payment to a recorded transaction by amount + currency +
// recency. The customer-paid amount equals the webhook's gross_amount (the
// `amount` field is net-of-fee), so we accept either.
export async function findMatch(opts: {
  amount: number;
  currency?: string;
  since: number;
}): Promise<WebhookTxn | undefined> {
  const events = await recent();
  const matches = events.filter(
    (e) =>
      e.at >= opts.since - 60_000 && // allow minor clock skew
      [e.grossAmount, e.amount].some(
        (a) => typeof a === "number" && Math.abs(a - opts.amount) < EPS,
      ) &&
      (!opts.currency || !e.currency || e.currency === opts.currency),
  );
  // Prefer a terminal event (FULFILLED/COMPLETED/CANCELLED/…) — that's the
  // "payment done" signal — over any non-terminal same-amount event. `events`
  // is newest-first, so .find keeps the most recent of each.
  return matches.find((e) => isTerminal(e.status)) ?? matches[0];
}
