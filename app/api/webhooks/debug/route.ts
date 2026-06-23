import { debugRecent, storeMode } from "@/app/lib/webhook-store";

export const dynamic = "force-dynamic";

// Diagnostic: GET /api/webhooks/debug shows the store mode and recent events.
// Use it to confirm webhooks are landing AND visible to the polling lambda.
// If mode is "memory" on Vercel, the webhook and the poll run in separate
// lambdas and won't share events — provision KV.
export async function GET() {
  const events = await debugRecent();
  return Response.json({
    mode: storeMode(),
    onVercel: Boolean(process.env.VERCEL),
    count: events.length,
    events: events.slice(0, 10).map((e) => ({
      reference: e.reference,
      status: e.status,
      amount: e.amount,
      grossAmount: e.grossAmount,
      currency: e.currency,
      at: new Date(e.at).toISOString(),
    })),
  });
}
