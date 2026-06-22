import type { NextRequest } from "next/server";
import { findMatch } from "@/app/lib/webhook-store";
import { getPayment } from "@/app/lib/swipe";

export const dynamic = "force-dynamic";

// The browser polls this to learn when a payment completed. It works in every
// environment:
//   1. Webhook store — populated by Swipe → /api/webhooks/swipe. Works on Vercel
//      (datacenter), where direct Swipe GET reads are Cloudflare-blocked.
//   2. Direct Swipe GET fallback — works locally (residential IP) and in mock
//      mode, where no real webhook is delivered.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const amount = Number(url.searchParams.get("amount"));
  const currency = url.searchParams.get("currency") || undefined;
  const since = Number(url.searchParams.get("since")) || 0;

  // 1) Webhook-driven match (the Vercel-safe path).
  if (Number.isFinite(amount) && amount > 0) {
    const m = await findMatch({ amount, currency, since });
    if (m) return Response.json({ status: m.status, reference: m.reference });
  }

  // 2) Fallback to a direct read (local/residential/mock).
  if (id) {
    try {
      const p = await getPayment(id);
      return Response.json({ status: p.status, reference: p.reference ?? null });
    } catch {
      /* blocked upstream (e.g. Cloudflare on Vercel) — rely on the webhook */
    }
  }

  return Response.json({ status: "PENDING" });
}
