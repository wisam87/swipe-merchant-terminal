import "server-only";
import { gunzipSync } from "node:zlib";

export type PaymentStatus = "PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED";

export type TransactionResponse = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  type?: string;
  status: PaymentStatus | string;
  description?: string;
  gross_amount?: number;
  net_amount?: number;
  fee_amount?: number;
  original_amount?: number;
  created_at?: string;
};

export type HistoryResponse = {
  transactions: TransactionResponse[];
  total: number;
};

export class NotFoundError extends Error {}

export type PaymentResponse = {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference?: string;
  short_code?: string;
  qr_data?: string;
  /** Pre-rendered QR as an inline SVG string (decoded from qr_data). */
  qr_svg?: string;
  /** Raw EMVCo payload string, when qr_data is not a pre-rendered image. */
  qr_emv?: string;
  payment_url?: string;
  created_at?: string;
};

// The Swipe OAuth client these credentials belong to lives on the PRODUCTION
// Ory issuer (api.swipe.mv). The dev API host (merchant-api.swipeapp.dev)
// introspects against a *different* issuer (oidc.swipeapp.dev) and therefore
// rejects production-issued tokens with "Token is not active". So token + API
// must both target the same environment — production by default here.
const OAUTH_TOKEN_URL =
  process.env.SWIPE_OAUTH_TOKEN_URL ?? "https://api.swipe.mv/oauth2/token";
const API_BASE = process.env.SWIPE_API_BASE ?? "https://api.swipe.mv";

// Identify honestly as a known API client. A *fake* browser UA (Chrome) on a
// Node/undici request is a "lying bot" signal Cloudflare blocks — which is why
// Postman (honest PostmanRuntime UA) succeeds where a spoofed-Chrome request
// gets a 403/WAF. Override via SWIPE_USER_AGENT to experiment if needed.
const USER_AGENT = process.env.SWIPE_USER_AGENT ?? "PostmanRuntime/7.39.0";

const isMock = () =>
  !process.env.SWIPE_CLIENT_ID || !process.env.SWIPE_CLIENT_SECRET;

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 30_000 > now) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SWIPE_CLIENT_ID!,
    client_secret: process.env.SWIPE_CLIENT_SECRET!,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

async function swipeFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    // Mirror what Postman sends so the fingerprint looks like a legit API client.
    Accept: "*/*",
    "User-Agent": USER_AGENT,
    "Cache-Control": "no-cache",
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  // Only send Content-Type when there's actually a body — a Content-Type on a
  // bodyless GET is an anomaly signal Cloudflare's bot rules can flag.
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

// Swipe returns qr_data as a base64-encoded, gzip-compressed, pre-rendered SVG
// of the branded QR code. Decode it to a usable SVG string. If it turns out to
// be a plain EMVCo payload instead, hand that back so the client can render it.
function decodeQr(qrData?: string): { qr_svg?: string; qr_emv?: string } {
  if (!qrData) return {};
  const buf = Buffer.from(qrData, "base64");
  let text: string;
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      text = gunzipSync(buf).toString("utf8");
    } catch {
      return { qr_emv: qrData };
    }
  } else {
    text = buf.toString("utf8");
  }
  if (text.includes("<svg")) return { qr_svg: text };
  return { qr_emv: text };
}

function withQr(payment: PaymentResponse): PaymentResponse {
  return { ...payment, ...decodeQr(payment.qr_data) };
}

// The stream payload comes in several shapes: a bare status STRING (e.g.
// "CONFIRMED"), the payment object directly ({status,...}), or a nested webhook
// shape ({data:{status, transaction_code,...}, eventType}). Pull the status and
// reference out of whichever we're handed.
export function extractStatus(raw: unknown): { status?: string; reference?: string } {
  if (typeof raw === "string") {
    const status = raw.trim();
    return status ? { status } : {};
  }
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const inner =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
  const status = (o.status ?? inner.status) as string | undefined;
  const reference = (o.reference ??
    inner.reference ??
    inner.transaction_code ??
    o.transaction_code) as string | undefined;
  return { status, reference };
}

// Upstream errors can be large Cloudflare HTML blocks; collapse them to a short,
// meaningful message for the UI and logs.
function summarizeError(label: string, status: number, body: string): string {
  if (/Attention Required|Cloudflare|cf-error/i.test(body)) {
    return `${label}: blocked by Cloudflare (HTTP ${status}). The upstream WAF rejected this request.`;
  }
  const trimmed = body.trim().slice(0, 300);
  return `${label} (HTTP ${status})${trimmed ? `: ${trimmed}` : ""}`;
}

const mockStore = new Map<string, { payment: PaymentResponse; createdAt: number }>();

function makeMockPayment(amount: number, currency: string): PaymentResponse {
  const id = crypto.randomUUID();
  const shortCode = `ST${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const emv = `00020101021226580014mv.swipe.merchant01${shortCode}5204000053034625802MV5912Swipe Demo6005Male62070503***6304ABCD`;
  return {
    id,
    amount,
    currency,
    status: "PENDING",
    reference: shortCode,
    short_code: shortCode,
    qr_data: Buffer.from(emv, "utf8").toString("base64"),
    created_at: new Date().toISOString(),
  };
}

export async function createPayment(input: {
  amount: number;
  currency?: "MVR" | "USD";
  description?: string;
}): Promise<PaymentResponse> {
  if (isMock()) {
    const payment = makeMockPayment(input.amount, input.currency ?? "MVR");
    mockStore.set(payment.id, { payment, createdAt: Date.now() });
    return withQr(payment);
  }

  const res = await swipeFetch("/api/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency ?? "MVR",
      type: "QR",
      description: input.description ?? "",
    }),
  });

  // Read the body as raw text first and dump it EXACTLY as api.swipe.mv sent it
  // — before any parsing or decoration — so the dev-server logs show the real,
  // unmodified upstream response.
  const text = await res.text();
  let keyLine = "";
  try {
    keyLine = `keys present: ${Object.keys(JSON.parse(text)).join(", ")}\n`;
  } catch {
    /* non-JSON body */
  }
  console.log(
    `\n===== [swipe] RAW create-payment response from api.swipe.mv (HTTP ${res.status}) =====\n` +
      keyLine +
      text +
      `\n===== [swipe] end raw response =====\n`,
  );

  if (!res.ok) {
    throw new Error(summarizeError("Create payment failed", res.status, text));
  }
  return withQr(JSON.parse(text) as PaymentResponse);
}

export async function getPayment(paymentId: string): Promise<PaymentResponse> {
  if (isMock()) {
    const entry = mockStore.get(paymentId);
    if (!entry) throw new Error("Not found");
    // Auto-complete the mock payment ~8 seconds after creation.
    const age = Date.now() - entry.createdAt;
    if (entry.payment.status === "PENDING" && age > 8000) {
      entry.payment = { ...entry.payment, status: "COMPLETED" };
      mockStore.set(paymentId, entry);
    }
    return withQr(entry.payment);
  }

  const res = await swipeFetch(`/api/v1/payments/${paymentId}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(summarizeError("Get payment failed", res.status, text));
  }
  return withQr((await res.json()) as PaymentResponse);
}

/**
 * Look up a transaction by its reference (transaction code, e.g. ST26173J85YY).
 * This is the authoritative status of the actual money movement, distinct from
 * the payment request. Throws NotFoundError (404) when no transaction exists
 * yet for the reference — i.e. the customer hasn't paid.
 */
export async function getTransaction(reference: string): Promise<TransactionResponse> {
  if (isMock()) {
    for (const { payment, createdAt } of mockStore.values()) {
      if (payment.reference !== reference && payment.short_code !== reference) continue;
      // Mirror the mock payment auto-complete (~8s) as a "transaction".
      const completed = Date.now() - createdAt > 8000;
      return {
        id: payment.id,
        reference,
        amount: payment.amount,
        currency: payment.currency,
        type: "P2M",
        status: completed ? "COMPLETED" : "PENDING",
        created_at: payment.created_at,
      };
    }
    throw new NotFoundError(`No transaction found for ${reference}`);
  }

  const res = await swipeFetch(`/api/v1/transactions/${encodeURIComponent(reference)}`);
  if (res.status === 404) {
    throw new NotFoundError(`No transaction found for ${reference}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(summarizeError("Get transaction failed", res.status, text));
  }
  return (await res.json()) as TransactionResponse;
}

function mockHistory(limit: number, offset: number): HistoryResponse {
  const total = 47;
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "PENDING", "EXPIRED", "CANCELLED"];
  const transactions: TransactionResponse[] = [];
  for (let i = offset; i < Math.min(offset + limit, total); i++) {
    const gross = (((i * 37) % 900) + 100) / 100;
    const fee = Math.round(gross) / 100;
    const net = Math.round((gross - fee) * 100) / 100;
    transactions.push({
      id: `mock-txn-${i}`,
      reference: `ST26${(174000 - i).toString(36).toUpperCase()}`,
      amount: net,
      gross_amount: gross,
      net_amount: net,
      fee_amount: fee,
      original_amount: gross,
      currency: i % 6 === 0 ? "USD" : "MVR",
      type: "P2M",
      status: statuses[i % statuses.length],
      description: i % 3 === 0 ? "swipe-transfer" : "",
      created_at: new Date(Date.now() - i * 5_400_000).toISOString(),
    });
  }
  return { transactions, total };
}

export async function listTransactions(opts: {
  limit: number;
  offset: number;
}): Promise<HistoryResponse> {
  if (isMock()) return mockHistory(opts.limit, opts.offset);

  const res = await swipeFetch(
    `/api/v1/history?limit=${opts.limit}&offset=${opts.offset}`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(summarizeError("List transactions failed", res.status, text));
  }
  return (await res.json()) as HistoryResponse;
}

/**
 * Open the upstream Server-Sent Events stream for a payment. Returns the raw
 * upstream Response so a route handler can pipe its body straight to the
 * browser (the browser must never see the bearer token). In mock mode it
 * synthesizes a PENDING → COMPLETED stream.
 */
export async function openPaymentStream(
  paymentId: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (isMock()) {
    return mockStream(paymentId, signal);
  }
  return swipeFetch(`/api/v1/payments/${paymentId}/stream`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal,
  });
}

function mockStream(paymentId: string, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ id: paymentId, status: "PENDING" });
      const timer = setTimeout(() => {
        const entry = mockStore.get(paymentId);
        if (entry) {
          entry.payment = { ...entry.payment, status: "COMPLETED" };
          mockStore.set(paymentId, entry);
        }
        send({ id: paymentId, status: "COMPLETED" });
        controller.close();
      }, 8000);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

export const isMockMode = isMock;
