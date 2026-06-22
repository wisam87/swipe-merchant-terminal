import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { recordEvent } from "@/app/lib/webhook-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Verify a Standard Webhooks signature. The signed content is
// `${id}.${timestamp}.${rawBody}`, HMAC-SHA256, base64. The header may contain
// several space-separated `v1,<sig>` values. The secret is base64 (optionally
// prefixed `whsec_`); some providers hand out a raw string, so we try both.
function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  header: string,
): boolean {
  const signed = `${id}.${timestamp}.${body}`;
  const base = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keys: Buffer[] = [Buffer.from(base, "base64"), Buffer.from(secret, "utf8")];
  const expected = keys.map((k) =>
    crypto.createHmac("sha256", k).update(signed).digest("base64"),
  );
  const provided = header
    .split(" ")
    .map((s) => (s.includes(",") ? s.slice(s.indexOf(",") + 1) : s))
    .filter(Boolean);

  return provided.some((p) =>
    expected.some((e) => {
      const a = Buffer.from(p);
      const b = Buffer.from(e);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }),
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text(); // raw body required for signature verification

  const id = req.headers.get("webhook-id") ?? "";
  const timestamp = req.headers.get("webhook-timestamp") ?? "";
  const signature = req.headers.get("webhook-signature") ?? "";

  const secret = process.env.SWIPE_WEBHOOK_SECRET;
  if (secret) {
    if (!verifySignature(secret, id, timestamp, body, signature)) {
      console.warn("[swipe webhook] signature verification FAILED");
      return new Response("invalid signature", { status: 401 });
    }
  } else {
    console.warn(
      "[swipe webhook] SWIPE_WEBHOOK_SECRET not set — accepting unverified (set it to enable verification)",
    );
  }

  let evt: { eventType?: string; data?: Record<string, unknown> };
  try {
    evt = JSON.parse(body);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const d = evt.data ?? {};
  const reference = d.transaction_code as string | undefined;
  const status = d.status as string | undefined;

  if (reference && status) {
    await recordEvent({
      reference,
      transactionId: (d.transaction_id as string) ?? "",
      status,
      amount: Number(d.amount),
      grossAmount: Number(d.gross_amount),
      currency: (d.currency as string) ?? "",
      at: Date.now(),
    });
    console.log(
      `[swipe webhook] ${evt.eventType} ${reference} ${status} ${d.currency} gross=${d.gross_amount}`,
    );
  }

  // Always 200 quickly so Swipe doesn't retry a successfully-received event.
  return new Response(null, { status: 204 });
}
