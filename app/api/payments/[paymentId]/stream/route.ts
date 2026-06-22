import type { NextRequest } from "next/server";
import { openPaymentStream } from "@/app/lib/swipe";

// SSE must stream — never statically optimize or buffer this route.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await ctx.params;

  let upstream: Response;
  try {
    upstream = await openPaymentStream(paymentId, req.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json(
      { error: `Stream failed (${upstream.status})`, detail: text },
      { status: upstream.status || 502 },
    );
  }

  // Pipe the upstream event-stream straight through to the browser.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
